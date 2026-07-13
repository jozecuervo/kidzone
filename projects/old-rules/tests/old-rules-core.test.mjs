import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const source = await readFile(join(projectRoot, "old-rules-core.js"), "utf8");
const context = {};
vm.runInNewContext(source, context);
const core = context.OldRulesCore;

function test(name, run) {
    try {
        run();
        console.log(`✓ ${name}`);
    } catch (error) {
        console.error(`✗ ${name}`);
        throw error;
    }
}

test("exit stays gated until every required key opens every door", () => {
    const doors = [{ open: true }, { open: false }];
    assert.equal(core.canUseExit(1, 2, doors), false);
    assert.equal(core.canUseExit(2, 2, doors), false);
    doors[1].open = true;
    assert.equal(core.canUseExit(2, 2, doors), true);
});

test("players and pursuers share collision-safe axis movement", () => {
    const wall = { x: 40, y: 0, w: 20, h: 100 };
    const player = { x: 10, y: 20, width: 30, height: 30 };
    const pursuer = { x: 60, y: 20, width: 40, height: 40 };

    core.moveWithCollisions(player, 3, 0, [wall]);
    core.moveWithCollisions(pursuer, -3, 0, [wall]);

    assert.equal(player.x, 10);
    assert.equal(pursuer.x, 60);
    assert.equal(core.rectsOverlap(player, pursuer), false);
});

test("open doors stop blocking the shared collision path", () => {
    const entity = { x: 10, y: 20, width: 30, height: 30 };
    const doors = [{ x: 40, y: 0, w: 20, h: 100, open: true }];
    const obstacles = core.blockingRects([], [], doors);

    core.moveWithCollisions(entity, 3, 0, obstacles);
    assert.equal(entity.x, 13);
});

test("transition cleanup cancels stale callbacks, animation, and held input", () => {
    const pending = new Map();
    const cancelledFrames = [];
    let nextId = 1;
    let staleCallbackRan = false;
    const lifecycle = core.createLifecycle({
        setTimeoutFn(callback) {
            const id = nextId++;
            pending.set(id, callback);
            return id;
        },
        clearTimeoutFn(id) {
            pending.delete(id);
        },
        cancelFrameFn(id) {
            cancelledFrames.push(id);
        }
    });
    const heldInput = { ArrowRight: true, KeyW: true };

    lifecycle.schedule(() => { staleCallbackRan = true; }, 2000);
    lifecycle.setFrame(42);
    lifecycle.reset(heldInput);
    for (const callback of pending.values()) callback();

    assert.equal(staleCallbackRan, false);
    assert.deepEqual(cancelledFrames, [42]);
    assert.deepEqual(heldInput, {});
});
