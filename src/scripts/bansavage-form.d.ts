export interface FormOptions {
  /** Rotation speed. 0 to 3, default 1. */
  spin?: number;
  /** How far the arms extend. 0 to 1.3, default 1. */
  reach?: number;
  /** How fast the arms cycle. 0.2 to 2, default 1. */
  pace?: number;
  /** Strength of the colour shift at the edges. 0 to 1, default 0.5. */
  sheen?: number;
  /** False stops scrolling from nudging the rotation. Default true. */
  scroll?: boolean;
}
export interface FormHandle {
  set(options: FormOptions): void;
  destroy(): void;
}
export declare function mountForm(canvas: HTMLCanvasElement, options?: FormOptions): FormHandle;
declare global { interface Window { Bansavage: { mountForm: typeof mountForm } } }
