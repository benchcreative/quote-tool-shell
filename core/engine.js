// Quote Tool Core Engine

async function loadConfig(configPath) {
  try {
    const response = await fetch(configPath);
    const config = await response.json();
    return config;
  } catch (error) {
    console.error("Error loading config:", error);
  }
}

async function initQuoteTool() {
  const config = await loadConfig("/configs/removals.json");

  console.log("Config loaded:", config);

  // Temporary test
  const app = document.getElementById("quote-tool");

  if (app) {
    app.innerHTML = `
      <h2>${config.name}</h2>
      <p>Config successfully loaded.</p>
    `;
  }
}

document.addEventListener("DOMContentLoaded", initQuoteTool);

