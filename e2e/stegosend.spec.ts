import { expect, test, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'

const password = 'correct horse battery staple'

async function makeCarrier(page: Page, width = 640, height = 480): Promise<Buffer> {
  const dataUrl = await page.evaluate(
    ({ width, height }) => {
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const context = canvas.getContext('2d')!
      context.fillStyle = '#dfe8e4'
      context.fillRect(0, 0, width, height)
      context.fillStyle = '#175d4b'
      context.fillRect(0, 0, width * 0.36, height)
      context.fillStyle = '#edc95f'
      context.fillRect(width * 0.62, height * 0.18, width * 0.24, height * 0.42)
      context.fillStyle = '#ffffff'
      context.font = '700 42px sans-serif'
      context.fillText('StegoSend', width * 0.08, height * 0.55)
      return canvas.toDataURL('image/png')
    },
    { width, height },
  )
  return Buffer.from(dataUrl.split(',')[1], 'base64')
}

async function uploadCarrier(page: Page, buffer: Buffer): Promise<void> {
  await page.getByLabel('选择载体图片').setInputFiles({
    name: 'carrier.png',
    mimeType: 'image/png',
    buffer,
  })
  await expect(page.getByText('640 × 480')).toBeVisible()
}

async function generatePng(page: Page, outputPath: string): Promise<void> {
  await page.getByLabel('设置口令').fill(password)
  await page.getByLabel('确认口令').fill(password)
  await page.getByRole('button', { name: '生成含密 PNG' }).click()
  const link = page.getByRole('link', { name: '下载含密 PNG' })
  await expect(link).toBeVisible({ timeout: 20_000 })
  const downloadPromise = page.waitForEvent('download')
  await link.click()
  const download = await downloadPromise
  await download.saveAs(outputPath)
}

test('text survives a real PNG encode/download/decode cycle without uploads', async ({
  page,
}, testInfo) => {
  const requests: Array<{ method: string; url: string }> = []
  page.on('request', (request) => requests.push({ method: request.method(), url: request.url() }))

  await page.goto('/')
  await uploadCarrier(page, await makeCarrier(page))
  await page.getByLabel('秘密文本').fill('浏览器里的端到端秘密')
  const pngPath = testInfo.outputPath('message.png')
  await generatePng(page, pngPath)

  const signature = await readFile(pngPath)
  expect(Array.from(signature.subarray(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10])

  await page.getByRole('tab', { name: '提取信息' }).click()
  await page.getByLabel('选择含密 PNG').setInputFiles(pngPath)
  await page.getByLabel('解码口令').fill(password)
  await page.getByRole('button', { name: '提取隐藏信息' }).click()
  await expect(page.getByLabel('隐藏文本')).toHaveText('浏览器里的端到端秘密', {
    timeout: 20_000,
  })

  expect(requests.every(({ method }) => method === 'GET')).toBe(true)
  if (testInfo.project.name === 'chromium') {
    expect(
      requests.every(({ url }) => {
        const parsed = new URL(url)
        return parsed.protocol === 'blob:' || parsed.hostname === '127.0.0.1'
      }),
    ).toBe(true)
  }
})

test('wrong password yields only the safe authentication message', async ({ page }, testInfo) => {
  await page.goto('/')
  await uploadCarrier(page, await makeCarrier(page))
  await page.getByLabel('秘密文本').fill('authenticated text')
  const pngPath = testInfo.outputPath('authenticated.png')
  await generatePng(page, pngPath)

  await page.getByRole('tab', { name: '提取信息' }).click()
  await page.getByLabel('选择含密 PNG').setInputFiles(pngPath)
  await page.getByLabel('解码口令').fill('definitely the wrong password')
  await page.getByRole('button', { name: '提取隐藏信息' }).click()
  await expect(page.getByRole('alert')).toHaveText('口令错误或图片已损坏。', {
    timeout: 20_000,
  })
  await expect(page.getByLabel('隐藏文本')).toHaveCount(0)
})

test('binary file survives byte-for-byte', async ({ page }, testInfo) => {
  const source = Buffer.from([0, 1, 2, 3, 127, 128, 254, 255])

  await page.goto('/')
  await uploadCarrier(page, await makeCarrier(page))
  await page.getByRole('button', { name: '文件' }).click()
  await page.getByLabel('选择秘密文件').setInputFiles({
    name: 'payload.bin',
    mimeType: 'application/octet-stream',
    buffer: source,
  })
  const pngPath = testInfo.outputPath('file-message.png')
  await generatePng(page, pngPath)

  await page.getByRole('tab', { name: '提取信息' }).click()
  await page.getByLabel('选择含密 PNG').setInputFiles(pngPath)
  await page.getByLabel('解码口令').fill(password)
  await page.getByRole('button', { name: '提取隐藏信息' }).click()
  const downloadLink = page.getByRole('link', { name: '下载文件' })
  await expect(downloadLink).toBeVisible({ timeout: 20_000 })
  const downloadPromise = page.waitForEvent('download')
  await downloadLink.click()
  const download = await downloadPromise
  const resultPath = testInfo.outputPath('decoded.bin')
  await download.saveAs(resultPath)

  expect(await readFile(resultPath)).toEqual(source)
})

test('mobile workspace has no horizontal overflow', async ({ page }) => {
  await page.goto('/')

  const metrics = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth,
  }))
  expect(metrics.content).toBeLessThanOrEqual(metrics.viewport)
  await expect(page.getByRole('button', { name: '生成含密 PNG' })).toBeVisible()
})
