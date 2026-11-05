import { createRoot } from "react-dom/client";
import App from "./app/App";
import CharacterApp from "./app/CharacterApp";
import "./app/style.css";
import "./app/responsive.css";
import "./app/terrain.css";
import "./app/battle.css";
createRoot(document.getElementById("root")!).render(
  new URLSearchParams(location.search).get("mode") === "characters" ? (
    <CharacterApp />
  ) : (
    <App />
  ),
);
