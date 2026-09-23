import { expect, test } from '@playwright/test'

test.describe('fluxos do workspace', () => {
  test('seta segurada atualiza o diff e para ao soltar', async ({ page }) => {
    await page.goto('/?fixture=local')
    await page.getByRole('button', { name: /Cargo\.toml/i }).click()
    await expect(page.locator('.path-label')).toContainText('Cargo.toml')

    const selected = page.locator('.lists-file-select[aria-current="true"]')
    let previousTitle = await selected.getAttribute('title')
    for (const repeat of [false, true, true]) {
      await page.evaluate((isRepeat) => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', repeat: isRepeat, bubbles: true }))
      }, repeat)
      await expect.poll(() => selected.getAttribute('title')).not.toBe(previousTitle)
      previousTitle = await selected.getAttribute('title')
    }
    const selectedTitle = (await selected.getAttribute('title'))!
    const selectedPath = selectedTitle.split('\n')[0]
    expect(selectedPath).not.toBe('Cargo.toml')
    await expect(page.locator('.path-label')).toContainText(selectedPath)

    await page.evaluate(() => {
      window.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowDown', bubbles: true }))
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', repeat: true, bubbles: true }))
    })
    await expect(selected).toHaveAttribute('title', selectedTitle)
  })

  for (const onlyChanges of [true, false]) test(`troca arquivos ${onlyChanges ? 'no modo compacto' : 'no modo completo'} sem esvaziar o editor`, async ({ page }) => {
    await page.goto('/?fixture=local')
    if (!onlyChanges) await page.getByRole('button', { name: 'Só alterações' }).click()
    const host = page.locator('.monaco-host')
    await expect(host.locator('.view-lines').first()).toContainText('refreshRepository')
    await page.evaluate(async () => {
      const { getBridge } = await import('/src/lib/bridge.ts')
      const bridge = getBridge()
      const original = bridge.getFilePreview.bind(bridge)
      let release!: () => void
      const gate = new Promise<void>((resolve) => { release = resolve })
      bridge.getFilePreview = (...args) => gate.then(() => original(...args))
      ;(window as Window & { releasePreview?: () => void }).releasePreview = release
      const windowWithCounter = window as Window & { blankFrames?: number; stopSampling?: () => void }
      windowWithCounter.blankFrames = 0
      let sampling = true
      windowWithCounter.stopSampling = () => { sampling = false }
      const sample = () => {
        if (!sampling) return
        const editorHost = document.querySelector('.monaco-host') as HTMLElement | null
        if (!editorHost || editorHost.hidden || getComputedStyle(editorHost).visibility !== 'visible' ||
            !editorHost.querySelector('.view-lines')?.textContent?.trim()) windowWithCounter.blankFrames!++
        requestAnimationFrame(sample)
      }
      requestAnimationFrame(sample)
    })

    await page.getByRole('button', { name: /README\.md/i }).click()
    await page.waitForTimeout(120)
    await expect(page.locator('.path-label')).toContainText('src/app.ts')
    await page.evaluate(() => (window as Window & { releasePreview: () => void }).releasePreview())
    await expect(page.locator('.path-label')).toContainText('README.md')
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
    const blankFrames = await page.evaluate(() => {
      const sampled = window as Window & { blankFrames: number; stopSampling: () => void }
      sampled.stopSampling()
      return sampled.blankFrames
    })
    expect(blankFrames).toBe(0)
  })

  test('expandir e restaurar diff preserva editor e layout anterior', async ({ page }) => {
    await page.goto('/?fixture=local')
    await page.getByRole('button', { name: /schema\.prisma/i }).click()
    const host = page.locator('.monaco-host')
    await expect(host.locator('.monaco-diff-editor')).toBeVisible()
    await host.evaluate((element) => element.setAttribute('data-editor-identity', 'preserved'))

    const panels = page.locator('.workspace [data-panel-id]')
    await expect(panels).toHaveCount(3)
    const originalWidths = await panels.evaluateAll((elements) => elements.map((element) => element.getBoundingClientRect().width))

    await page.getByRole('button', { name: /Expandir diff em tela cheia/i }).click()
    await expect(host).toHaveAttribute('data-editor-identity', 'preserved')
    await expect.poll(async () => (await panels.nth(0).boundingBox())?.width ?? -1).toBeLessThan(2)
    await expect.poll(async () => (await panels.nth(2).boundingBox())?.width ?? 0).toBeGreaterThan(originalWidths[2])

    await page.getByRole('button', { name: /Restaurar painel de histórico/i }).click()
    await expect(host).toHaveAttribute('data-editor-identity', 'preserved')
    await expect.poll(async () => (await panels.nth(0).boundingBox())?.width ?? 0).toBeGreaterThan(originalWidths[0] - 2)
    await expect(page.locator('.diff-panel-loading')).toHaveCount(0)
  })

  test('local: seleciona arquivo, preserva mensagem ao atualizar e alterna stage', async ({ page }) => {
    await page.goto('/?fixture=local')
    await expect(page.getByRole('heading', { name: 'Alterações locais' })).toBeVisible()
    const file = page.getByRole('button', { name: /schema\.prisma/i })
    await file.click()
    await expect(page.locator('.monaco-host')).toBeVisible()
    await page.locator('#commit-message').fill('Preservar estado durante atualização')
    await page.getByTitle(/Atualizar/).click()
    await expect(page.locator('#commit-message')).toHaveValue('Preservar estado durante atualização')
    await expect(file).toHaveAttribute('aria-current', 'true')
    await page.evaluate(() => document.querySelector('.monaco-host')?.setAttribute('data-editor-identity', 'preserve'))
    await page.getByTitle(/Atualizar/).click()
    await expect(page.locator('.monaco-host')).toHaveAttribute('data-editor-identity', 'preserve')
    await expect(page.locator('.monaco-editor .view-lines').first()).toContainText('refreshRepository')
    const checkbox = page.getByRole('checkbox', { name: /schema\.prisma/i })
    await checkbox.check()
    await expect(page.getByText('Em stage').locator('..').getByText('3', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: /Criar commit/i }).click()
    await expect(page.locator('#commit-message')).toHaveValue('')
    await page.screenshot({ path: 'target/visual/workflow-local.png', fullPage: true })
  })

  test('histórico alterna os dois modos com conteúdo real e não exibe stage', async ({ page }) => {
    await page.goto('/?fixture=history')
    await expect(page.getByRole('heading', { name: 'Histórico' })).toBeVisible()
    const commitRow = page.locator('button.lists-graph-row').filter({ hasText: 'Refine repository workspace' })
    await expect(commitRow).toBeVisible()
    await commitRow.click()
    await expect(page.getByRole('heading', { name: 'Arquivos do commit' })).toBeVisible()
    await page.getByRole('button', { name: /app\.ts/i }).click()
    await expect(page.locator('.monaco-host')).toBeVisible()
    await expect(page.locator('.monaco-editor .view-lines').first()).toContainText('refreshRepository')
    await page.getByTitle('Lado a lado').click()
    await expect(page.locator('.monaco-editor.original-in-monaco-diff-editor')).toBeVisible()
    await page.getByTitle('Unificado').click()
    await expect(page.locator('.monaco-editor .view-lines').first()).toContainText('refreshRepository')
    await expect(page.getByRole('checkbox')).toHaveCount(0)
    await expect(page.getByRole('button', { name: /Criar commit/i })).toHaveCount(0)
    await page.setViewportSize({ width: 1100, height: 700 })
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
    await page.screenshot({ path: 'target/visual/workflow-history.png', fullPage: true })
  })

  test('conflito bloqueia commit e fixture binary informa indisponibilidade', async ({ page }) => {
    await page.goto('/?fixture=conflict')
    await expect(page.getByRole('button', { name: /Criar commit/i })).toBeDisabled()
    await page.goto('/?fixture=binary')
    await expect(page.getByText('Arquivo binário', { exact: true })).toBeVisible()
  })
})
