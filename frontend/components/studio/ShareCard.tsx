export async function downloadWithWatermark(imageUrl: string): Promise<void> {
  try {
    // Fetch the image
    const response = await fetch(imageUrl);
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);

    // Create an offscreen image to get natural dimensions
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        // Cap canvas width at 2400px
        const maxWidth = 2400;
        const scale = maxWidth / img.naturalWidth;
        const width = Math.min(img.naturalWidth, maxWidth);
        const height = img.naturalHeight * (width / img.naturalWidth);

        // Create offscreen canvas
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");

        if (!ctx) {
          URL.revokeObjectURL(objectUrl);
          return;
        }

        // Draw the image
        ctx.drawImage(img, 0, 0, width, height);

        // Add watermark text
        const fontSize = Math.max(13, width * 0.008);
        ctx.font = `600 ${fontSize}px "Public Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
        ctx.fillStyle = "rgba(0, 0, 0, 0.45)";

        // Text shadow
        const shadowOffsetX = 1;
        const shadowOffsetY = 1;
        const text = "STYLESENSE";
        const metrics = ctx.measureText(text);
        const textWidth = metrics.width;
        const rightPadding = 16;
        const bottomPadding = 20;
        const x = width - textWidth - rightPadding;
        const y = height - bottomPadding;

        ctx.fillText(text, x + shadowOffsetX, y + shadowOffsetY);

        // Main text color
        ctx.fillStyle = "rgba(255, 255, 255, 0.82)";
        ctx.fillText(text, x, y);

        // Convert to blob and download
        canvas.toBlob((canvasBlob) => {
          if (canvasBlob) {
            const downloadUrl = URL.createObjectURL(canvasBlob);
            const link = document.createElement("a");
            link.href = downloadUrl;
            link.download = "stylesense-look.jpg";
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(downloadUrl);
          }
          URL.revokeObjectURL(objectUrl);
        }, "image/jpeg", 0.92);
      } catch (error) {
        URL.revokeObjectURL(objectUrl);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
    };
    img.src = objectUrl;
  } catch (error) {
    // Silently handle errors
  }
}
