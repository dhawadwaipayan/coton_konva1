// Dynamic import to avoid build issues with WebGPU modules
let removeBackground: any = null;

// Initialize the background removal function dynamically
const initBackgroundRemoval = async () => {
  if (!removeBackground) {
    try {
      const module = await import('@imgly/background-removal');
      removeBackground = module.removeBackground;
    } catch (error) {
      console.error('Failed to load background removal module:', error);
      throw new Error('Background removal is not available in this environment');
    }
  }
  return removeBackground;
};

export interface BackgroundRemovalResult {
  success: boolean;
  data?: Blob;
  error?: string;
}

/**
 * Remove background from an image using @imgly/background-removal
 * @param imageData - Image data as base64 string, Blob, or URL
 * @returns Promise with background removal result
 */
export const removeImageBackground = async (imageData: string | Blob): Promise<BackgroundRemovalResult> => {
  try {
    console.log('[Background Removal] Starting background removal...');
    
    // Initialize the background removal function
    const removeBackgroundFn = await initBackgroundRemoval();
    
    // Convert base64 to Blob if needed
    let imageBlob: Blob;
    if (typeof imageData === 'string') {
      // Handle base64 data URL
      const response = await fetch(imageData);
      imageBlob = await response.blob();
    } else {
      imageBlob = imageData;
    }
    
    console.log('[Background Removal] Image blob size:', imageBlob.size, 'bytes');
    
    // Remove background using @imgly/background-removal
    const result = await removeBackgroundFn(imageBlob);
    
    console.log('[Background Removal] Background removal successful, result size:', result.size, 'bytes');
    
    return {
      success: true,
      data: result
    };
  } catch (error) {
    console.error('[Background Removal] Error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
};

/**
 * Convert Blob to base64 data URL
 * @param blob - Image blob
 * @returns Promise with base64 data URL
 */
export const blobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Failed to convert blob to base64'));
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}; 