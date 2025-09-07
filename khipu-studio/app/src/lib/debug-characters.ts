// Debug utility to test character detection
export async function debugCharacterDetection() {
  console.log("=== DEBUG CHARACTER DETECTION ===");
  
  try {
    // Test if window.khipu is available
    if (!window.khipu) {
      console.log("❌ window.khipu is not available");
      return;
    }
    
    console.log("✅ window.khipu is available");
    
    // Test with sample project path
    const samplePath = "c:\\code\\audiolibros\\khipu-studio\\sample";
    console.log("Testing with path:", samplePath);
    
    // Try to read the characters file directly
    const result = await window.khipu.call("fs:read", {
      projectRoot: samplePath,
      relPath: "dossier/characters.json",
      json: true,
    });
    
    console.log("✅ Successfully loaded characters:", result);
    console.log("Character count:", Array.isArray(result) ? result.length : "Not an array");
    
  } catch (error) {
    console.log("❌ Error in debug test:", error);
  }
  
  console.log("=== END DEBUG ===");
}

// Make it available globally for testing
declare global {
  interface Window {
    debugCharacterDetection: () => Promise<void>;
  }
}

window.debugCharacterDetection = debugCharacterDetection;
