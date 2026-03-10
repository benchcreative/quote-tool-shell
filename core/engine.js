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
  const app = document.getElementById("quote-tool");

  try {
    const config = await loadConfig("configs/removals.json");

    if (!config) {
      throw new Error("Config not found");
    }

    console.log("Config loaded:", config);

    if (app) {
      app.innerHTML = `
        <h2>${config.name}</h2>
        <p>Config successfully loaded.</p>
      `;
    }
  } catch (error) {
    console.error(error);

    if (app) {
      app.innerHTML = `
        <h2>Error</h2>
        <p>Could not load config file.</p>
      `;
    }
  }
}

document.addEventListener("DOMContentLoaded", initQuoteTool);
