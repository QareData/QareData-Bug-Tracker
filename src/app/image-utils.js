export function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Lecture image impossible"));
    reader.readAsDataURL(file);
  });
}

export function optimizeImage(dataUrl, mimeType) {
  if (mimeType === "image/svg+xml") {
    return Promise.resolve(dataUrl);
  }

  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const maxWidth = 1440;
      const maxHeight = 1080;
      const ratio = Math.min(maxWidth / image.width, maxHeight / image.height, 1);
      const width = Math.round(image.width * ratio);
      const height = Math.round(image.height * ratio);
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");

      if (!context) {
        resolve(dataUrl);
        return;
      }

      context.drawImage(image, 0, 0, width, height);
      resolve(canvas.toDataURL("image/jpeg", 0.84));
    };
    image.onerror = () => reject(new Error("Optimisation image impossible"));
    image.src = dataUrl;
  });
}
