/**
 * BackButton — small persistent "← VOLTAR" widget pinned to the top-left
 * of menu scenes.
 *
 * Phones don't have an Esc key, so every scene that used to rely on
 * keyboard-Esc to navigate back needs a visible tap target. This helper
 * standardises the look + position across scenes; callers wire up the
 * actual back action.
 */

import Phaser from 'phaser';

export interface BackButtonOptions {
  scene: Phaser.Scene;
  label?: string;
  onClick: () => void;
}

export interface BackButtonHandle {
  destroy: () => void;
  setPosition: (x: number, y: number) => void;
}

export function createBackButton(opts: BackButtonOptions): BackButtonHandle {
  const { scene, onClick } = opts;
  const label = opts.label ?? '← VOLTAR';

  const x = 16;
  const y = 18;

  const container = scene.add.container(x, y);
  // High depth so the button sits above backdrops + most scene content.
  container.setDepth(800);

  const w = 92;
  const h = 28;
  const bg = scene.add
    .rectangle(0, 0, w, h, 0x251338, 0.92)
    .setStrokeStyle(2, 0xffcc55, 0.95)
    .setOrigin(0, 0);

  const text = scene.add
    .text(w / 2, h / 2, label, {
      fontFamily: 'monospace',
      fontSize: '12px',
      color: '#ffe',
      fontStyle: 'bold',
    })
    .setOrigin(0.5);

  container.add([bg, text]);

  bg.setInteractive({ useHandCursor: true });
  bg.on('pointerover', () => {
    bg.setFillStyle(0x36204c, 0.95);
  });
  bg.on('pointerout', () => {
    bg.setFillStyle(0x251338, 0.92);
  });
  bg.on('pointerup', () => onClick());

  return {
    destroy: (): void => {
      container.destroy(true);
    },
    setPosition: (nx: number, ny: number): void => {
      container.setPosition(nx, ny);
    },
  };
}
