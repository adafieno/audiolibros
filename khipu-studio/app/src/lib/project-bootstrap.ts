/**
 * Project bootstrapping utilities for new project creation
 */

/**
 * Bootstrap essential project files and directories for a new project
 */
export async function bootstrapProjectFiles(projectPath: string): Promise<void> {
  try {
    // Create initial characters.json file for the characters page
    const emptyCharacters = {
      characters: []
    };
    
    await window.khipu!.call("fs:write", {
      projectRoot: projectPath,
      relPath: "dossier/characters.json",
      json: true,
      content: emptyCharacters
    });

    // Create initial book.meta.json file for the book page
    const defaultBookMeta = {
      title: "",
      subtitle: "",
      authors: [],
      narrators: [],
      language: "es-PE",
      description: "",
      keywords: [],
      categories: [],
      publisher: "",
      publication_date: "",
      rights: "",
      series: {
        name: "",
        number: null
      }
    };

    await window.khipu!.call("fs:write", {
      projectRoot: projectPath,
      relPath: "book.meta.json", 
      json: true,
      content: defaultBookMeta
    });

    console.log('✅ Project files bootstrapped successfully');
    
  } catch (error) {
    console.error('Failed to bootstrap project files:', error);
    throw error;
  }
}