// Static data preloaded before rendering starts (scenes read synchronously).
export const DATA = {};

export async function preload() {
  const files = { go: 'go_game2.json' };
  await Promise.all(
    Object.entries(files).map(async ([k, f]) => {
      DATA[k] = await (await fetch(`../data/${f}`)).json();
    }),
  );
}
