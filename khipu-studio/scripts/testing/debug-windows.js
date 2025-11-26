const { execSync } = require('child_process');

console.log("🔍 Listing all windows with titles...");

try {
    const allWindows = execSync(`
        Get-Process | Where-Object { $_.MainWindowTitle -ne "" } | Select-Object ProcessName, Id, MainWindowTitle | Sort-Object MainWindowTitle | ConvertTo-Json
    `, { encoding: 'utf8' });

    console.log("All windows with titles:");
    const windows = JSON.parse(allWindows || '[]');
    
    if (Array.isArray(windows)) {
        windows.forEach((w, i) => {
            console.log(`${i + 1}. "${w.MainWindowTitle}" (${w.ProcessName}, PID: ${w.Id})`);
        });
    } else if (windows.MainWindowTitle) {
        console.log(`1. "${windows.MainWindowTitle}" (${windows.ProcessName}, PID: ${windows.Id})`);
    } else {
        console.log("No windows found");
    }

    // Now look specifically for anything with "Vite", "React", or "TS"
    console.log("\n🎯 Looking for Vite/React/TS related windows...");
    const viteWindows = execSync(`
        Get-Process | Where-Object { $_.MainWindowTitle -like "*Vite*" -or $_.MainWindowTitle -like "*React*" -or $_.MainWindowTitle -like "*TS*" } | Select-Object ProcessName, Id, MainWindowTitle | ConvertTo-Json
    `, { encoding: 'utf8' });

    const viteResults = JSON.parse(viteWindows || '[]');
    if (Array.isArray(viteResults)) {
        viteResults.forEach((w, i) => {
            console.log(`${i + 1}. "${w.MainWindowTitle}" (${w.ProcessName}, PID: ${w.Id})`);
        });
    } else if (viteResults.MainWindowTitle) {
        console.log(`1. "${viteResults.MainWindowTitle}" (${viteResults.ProcessName}, PID: ${viteResults.Id})`);
    } else {
        console.log("No Vite/React/TS windows found");
    }

} catch (error) {
    console.error("❌ Error:", error.message);
}