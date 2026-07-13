(function (root) {
    function rectsOverlap(r1, r2) {
        return r1.x < r2.x + r2.w &&
            r1.x + r1.w > r2.x &&
            r1.y < r2.y + r2.h &&
            r1.y + r1.h > r2.y;
    }

    function blockingRects(walls, furniture, doors) {
        return [
            ...walls,
            ...furniture.map(({ x, y, w, h }) => ({ x, y, w, h })),
            ...doors.filter((door) => !door.open).map(({ x, y, w, h }) => ({ x, y, w, h }))
        ];
    }

    function moveWithCollisions(entity, dx, dy, obstacles) {
        const collidesAt = (x, y) => obstacles.some((obstacle) => rectsOverlap({
            x,
            y,
            w: entity.width,
            h: entity.height
        }, obstacle));

        if (!collidesAt(entity.x + dx, entity.y)) entity.x += dx;
        if (!collidesAt(entity.x, entity.y + dy)) entity.y += dy;
    }

    function canUseExit(collectedKeys, keysNeeded, doors) {
        return collectedKeys >= keysNeeded && doors.every((door) => door.open);
    }

    function createLifecycle({ setTimeoutFn, clearTimeoutFn, cancelFrameFn }) {
        const timeoutIds = new Set();
        let frameId = null;

        return {
            schedule(callback, delay) {
                const timeoutId = setTimeoutFn(() => {
                    timeoutIds.delete(timeoutId);
                    callback();
                }, delay);
                timeoutIds.add(timeoutId);
                return timeoutId;
            },
            setFrame(nextFrameId) {
                frameId = nextFrameId;
            },
            reset(heldInput) {
                for (const timeoutId of timeoutIds) clearTimeoutFn(timeoutId);
                timeoutIds.clear();
                if (frameId !== null) cancelFrameFn(frameId);
                frameId = null;
                for (const code of Object.keys(heldInput)) delete heldInput[code];
            }
        };
    }

    root.OldRulesCore = {
        rectsOverlap,
        blockingRects,
        moveWithCollisions,
        canUseExit,
        createLifecycle
    };
}(typeof window === "undefined" ? globalThis : window));
