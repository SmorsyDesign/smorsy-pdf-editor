const FONT_LOAD_LIMIT_MS = 5000;

/** Work waits in line for this, so a load that never finished would hold up everything after it. */
export async function loadWithinTime(font: string, text?: string): Promise<readonly FontFace[]> {
  let timer = 0;
  const tooSlow = new Promise<never>((_, reject) => {
    timer = window.setTimeout(() => {
      reject(new Error(`This font took too long to load: ${font}`));
    }, FONT_LOAD_LIMIT_MS);
  });
  try {
    return await Promise.race([document.fonts.load(font, text), tooSlow]);
  } finally {
    window.clearTimeout(timer);
  }
}
