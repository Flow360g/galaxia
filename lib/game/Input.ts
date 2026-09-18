/**
 * Unified steering input.
 *
 * Emits a normalised axis pair (-1..1 on each of x and y) so nothing
 * downstream knows or cares whether the player is on a phone or a keyboard.
 *
 * Mobile uses RELATIVE drag, not absolute screen position: steering is
 * measured from wherever the thumb first landed. Absolute steering snaps the
 * ship sideways the instant you touch the screen and forces you to cover the
 * ship with your hand to fly straight. Relative drag lets the player hold the
 * phone however they like and keeps the ship visible.
 */

const KEY_LEFT = new Set(["ArrowLeft", "a", "A"]);
const KEY_RIGHT = new Set(["ArrowRight", "d", "D"]);
const KEY_UP = new Set(["ArrowUp", "w", "W"]);
const KEY_DOWN = new Set(["ArrowDown", "s", "S"]);

/** Drag distance, as a fraction of the shorter viewport edge, for full tilt. */
const FULL_DEFLECTION = 0.18;

export class Input {
  /** Normalised steering, -1..1. Read by Ship each frame. */
  readonly axis = { x: 0, y: 0 };

  private pointerId: number | null = null;
  private originX = 0;
  private originY = 0;
  private dragX = 0;
  private dragY = 0;

  private keyLeft = false;
  private keyRight = false;
  private keyUp = false;
  private keyDown = false;

  private disposed = false;

  constructor(private readonly element: HTMLElement) {
    element.addEventListener("pointerdown", this.onPointerDown);
    element.addEventListener("pointermove", this.onPointerMove);
    element.addEventListener("pointerup", this.onPointerUp);
    element.addEventListener("pointercancel", this.onPointerUp);
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.onBlur);
  }

  private onPointerDown = (event: PointerEvent) => {
    if (this.pointerId !== null) return;
    this.pointerId = event.pointerId;
    this.originX = event.clientX;
    this.originY = event.clientY;
    this.dragX = 0;
    this.dragY = 0;
    this.element.setPointerCapture(event.pointerId);
  };

  private onPointerMove = (event: PointerEvent) => {
    if (event.pointerId !== this.pointerId) return;
    // Full deflection is a fraction of the SHORTER edge, so the gesture feels
    // the same in portrait and landscape.
    const reference = Math.min(window.innerWidth, window.innerHeight);
    const span = reference * FULL_DEFLECTION;
    this.dragX = clamp((event.clientX - this.originX) / span, -1, 1);
    this.dragY = clamp((event.clientY - this.originY) / span, -1, 1);
  };

  private onPointerUp = (event: PointerEvent) => {
    if (event.pointerId !== this.pointerId) return;
    if (this.element.hasPointerCapture(event.pointerId)) {
      this.element.releasePointerCapture(event.pointerId);
    }
    this.pointerId = null;
    this.dragX = 0;
    this.dragY = 0;
  };

  private onKeyDown = (event: KeyboardEvent) => {
    if (KEY_LEFT.has(event.key)) this.keyLeft = true;
    else if (KEY_RIGHT.has(event.key)) this.keyRight = true;
    else if (KEY_UP.has(event.key)) this.keyUp = true;
    else if (KEY_DOWN.has(event.key)) this.keyDown = true;
    else return;
    event.preventDefault();
  };

  private onKeyUp = (event: KeyboardEvent) => {
    if (KEY_LEFT.has(event.key)) this.keyLeft = false;
    else if (KEY_RIGHT.has(event.key)) this.keyRight = false;
    else if (KEY_UP.has(event.key)) this.keyUp = false;
    else if (KEY_DOWN.has(event.key)) this.keyDown = false;
  };

  /** Alt-tabbing mid-turn must not leave a key stuck down. */
  private onBlur = () => {
    this.keyLeft = false;
    this.keyRight = false;
    this.keyUp = false;
    this.keyDown = false;
    this.pointerId = null;
    this.dragX = 0;
    this.dragY = 0;
  };

  /** Called once per frame before Ship.update. Allocation-free. */
  update(): void {
    const keyX = (this.keyRight ? 1 : 0) - (this.keyLeft ? 1 : 0);
    const keyY = (this.keyDown ? 1 : 0) - (this.keyUp ? 1 : 0);

    // Pointer wins when it is down, otherwise fall through to keys. Screen Y
    // grows downward, so drag-down must steer the ship down: no inversion.
    this.axis.x = this.pointerId !== null ? this.dragX : keyX;
    this.axis.y = this.pointerId !== null ? this.dragY : keyY;
  }

  get isActive(): boolean {
    return (
      this.pointerId !== null ||
      this.keyLeft ||
      this.keyRight ||
      this.keyUp ||
      this.keyDown
    );
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.element.removeEventListener("pointerdown", this.onPointerDown);
    this.element.removeEventListener("pointermove", this.onPointerMove);
    this.element.removeEventListener("pointerup", this.onPointerUp);
    this.element.removeEventListener("pointercancel", this.onPointerUp);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.onBlur);
  }
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}
