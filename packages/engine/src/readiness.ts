export function readContentState() {
  const text = (document.body?.innerText ?? "").trim().length;
  const images = Array.from(document.images);
  const hasExecutableScripts = Array.from(document.scripts).some((script) => {
    const type = script.type.trim().toLowerCase().split(";")[0].trim();
    return !type || type === "module" || /^(?:text|application)\/(?:x-)?(?:java|ecma)script/.test(type);
  });
  return {
    text,
    imagesComplete: images.length > 0 && images.every((image) => image.complete && image.naturalWidth > 0),
    staticReady: document.readyState === "complete" && !hasExecutableScripts && text >= 40 &&
      !document.querySelector("iframe,frame,object,embed"),
    scrollable: document.documentElement.scrollHeight > window.innerHeight + 50,
  };
}
