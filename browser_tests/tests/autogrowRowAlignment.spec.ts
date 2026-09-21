import { expect } from '@playwright/test'
import { comfyPageFixture as baseTest } from '@e2e/fixtures/ComfyPage'
import {
  BYTEDANCE_REFERENCE_NODE_TYPE,
  REFERENCE_IMAGES_PREFIX,
  byteDanceReferenceNodeDef
} from '@e2e/fixtures/data/byteDanceReferenceNodeDef'
import {
  getConnectedInputs,
  getInputNames
} from '@e2e/fixtures/utils/nodeInputLinks'
import { routeObjectInfoFromSetupApi } from '@e2e/fixtures/utils/objectInfo'
import { toNodeId } from '@/types/nodeId'
import type { NodeReference } from '@e2e/fixtures/utils/litegraphUtils'
import type { ComfyPage } from '@e2e/fixtures/ComfyPage'

const REFERENCE_NODE_ID = '26'

const test = baseTest.extend({
  page: async ({ page }, use) => {
    const unrouteObjectInfo = await routeObjectInfoFromSetupApi(
      page,
      (objectInfo) => {
        objectInfo[BYTEDANCE_REFERENCE_NODE_TYPE] = byteDanceReferenceNodeDef
      }
    )
    try {
      await use(page)
    } finally {
      await unrouteObjectInfo()
    }
  }
})

/** Full-array index of a reference-images input, looked up by name. */
async function fullIndexOf(comfyPage: ComfyPage, name: string) {
  return comfyPage.page.evaluate(
    ({ nodeId, name }) => {
      const node = window.app!.canvas.graph!.getNodeById(nodeId)
      if (!node) throw new Error('node not found')
      const index = node.inputs.findIndex((input) => input.name === name)
      if (index === -1) throw new Error(`${name} not found`)
      return index
    },
    { nodeId: toNodeId(REFERENCE_NODE_ID), name }
  )
}

/** Wires `source` onto the group's current free trailing slot. */
async function connectNextReferenceImage(
  comfyPage: ComfyPage,
  source: NodeReference,
  referenceNode: NodeReference
) {
  const names = await getInputNames(
    comfyPage,
    REFERENCE_NODE_ID,
    REFERENCE_IMAGES_PREFIX
  )
  const connectedNames = new Set(
    (
      await getConnectedInputs(
        comfyPage,
        REFERENCE_NODE_ID,
        REFERENCE_IMAGES_PREFIX
      )
    ).map((input) => input.name)
  )
  const freeSlotName = names.find((name) => !connectedNames.has(name))
  if (!freeSlotName) {
    throw new Error(
      `expected a free trailing ${REFERENCE_IMAGES_PREFIX} slot among [${names.join(', ')}]`
    )
  }
  const targetIndex = await fullIndexOf(comfyPage, freeSlotName)
  await source.connectOutput(0, referenceNode, targetIndex)
}

test.describe(
  'Autogrow reference-image row alignment',
  { tag: ['@vue-nodes', '@node'] },
  () => {
    test.beforeEach(async ({ comfyPage }) => {
      await comfyPage.workflow.loadWorkflow(
        'subgraphs/autogrow-reference-images'
      )
      await comfyPage.vueNodes.waitForNodes()
    })

    // Reported live on nightly by a tester stress-testing the in-app agent
    // (2026-09-19): "When 5 inputs were connected on seedance, the dot and
    // the widget names drift on different rows so looks like each input is
    // having an additional empty row." The fixture workflow already wires
    // image_1..3 onto a mocked Seedance-shaped reference_images autogrow
    // group; grow it to 5 connected references back-to-back (no settle time
    // between the two new connects) and check every row's connection dot
    // (what LiteGraph draws the link to/from - node.getInputPos, which in
    // Vue Nodes mode is backed by the DOM-measured slot-offset cache) still
    // lands inside the DOM row that actually shows that slot's label.
    test('keeps every connection dot aligned with its own label row after growing to 5 references', async ({
      comfyPage
    }, testInfo) => {
      const referenceNode =
        await comfyPage.nodeOps.getNodeRefById(REFERENCE_NODE_ID)
      const image4Source = await comfyPage.nodeOps.addNode(
        'LoadImage',
        undefined,
        { x: 100, y: 700 }
      )
      const image5Source = await comfyPage.nodeOps.addNode(
        'LoadImage',
        undefined,
        { x: 100, y: 900 }
      )

      const namesBefore = await getInputNames(
        comfyPage,
        REFERENCE_NODE_ID,
        REFERENCE_IMAGES_PREFIX
      )

      // Zoom out before dragging: LiteGraph auto-pans the canvas when a drag
      // approaches the viewport edge, which a real user reacts to but a
      // scripted Playwright drag - interpolating toward a fixed, precomputed
      // client position - cannot. Without this the second drag's target
      // position goes stale mid-drag and the connection lands on the wrong
      // slot, independent of anything under test here.
      await comfyPage.page.evaluate(() => {
        window.app!.canvas.ds.scale = 0.4
        window.app!.canvas.ds.offset[0] = 0
        window.app!.canvas.ds.offset[1] = 0
        window.app!.canvas.setDirty(true, true)
      })
      await comfyPage.nextFrame()
      await connectNextReferenceImage(comfyPage, image4Source, referenceNode)
      await connectNextReferenceImage(comfyPage, image5Source, referenceNode)
      await comfyPage.nextFrame()

      const names = await getInputNames(
        comfyPage,
        REFERENCE_NODE_ID,
        REFERENCE_IMAGES_PREFIX
      )
      // Two new connections grow the group by exactly two slots: one newly
      // connected slot per connect, plus the one free trailing slot autogrow
      // always keeps past the last connected slot staying in place.
      expect(names).toHaveLength(namesBefore.length + 2)
      expect(names).toEqual(
        Array.from(
          { length: names.length },
          (_, i) => `${REFERENCE_IMAGES_PREFIX}image_${i + 1}`
        )
      )

      const rowInfo: { index: number; box: { y: number; height: number } }[] =
        []
      for (const name of names) {
        const index = await fullIndexOf(comfyPage, name)
        const row = comfyPage.vueNodes.getInputSlotRow(REFERENCE_NODE_ID, index)
        await expect(row).toBeVisible()
        const box = await row.boundingBox()
        if (!box) throw new Error(`row for ${name} has no bounding box`)
        rowInfo.push({ index, box })
      }

      await testInfo.attach('reference-node-after-five-connects', {
        body: await comfyPage.vueNodes
          .getNodeLocator(REFERENCE_NODE_ID)
          .screenshot({
            path: testInfo.outputPath('reference-node-after-five-connects.png')
          }),
        contentType: 'image/png'
      })

      for (const { index, box } of rowInfo) {
        const dotClientPos = await comfyPage.page.evaluate(
          ({ nodeId, index }) => {
            const node = window.app!.canvas.graph!.getNodeById(nodeId)
            if (!node) throw new Error('node not found')
            const [x, y] = node.getInputPos(index)
            return window.app!.canvasPosToClientPos([x, y])
          },
          { nodeId: toNodeId(REFERENCE_NODE_ID), index }
        )

        expect(
          dotClientPos[1],
          `slot ${index}'s connection dot should land within its own label row`
        ).toBeGreaterThanOrEqual(box.y)
        expect(
          dotClientPos[1],
          `slot ${index}'s connection dot should land within its own label row`
        ).toBeLessThanOrEqual(box.y + box.height)
      }
    })
  }
)
