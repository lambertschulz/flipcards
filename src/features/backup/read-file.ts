// Read a `File` as UTF-8 text. In real browsers we use `File.text()` (ES2020
// baseline). JSDOM, which underpins our unit tests, doesn't implement that
// method on its File polyfill — so we fall back to the older `FileReader`
// path when `.text()` is missing.

export async function readFileAsText(file: File): Promise<string> {
  if (typeof file.text === "function") {
    return await file.text();
  }
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === "string") resolve(result);
      else reject(new Error("FileReader returned non-string result"));
    };
    reader.onerror = () => reject(reader.error ?? new Error("FileReader failed"));
    reader.readAsText(file);
  });
}
