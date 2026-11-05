import { createRoot } from "react-dom/client";
import CharacterApp from "./app/CharacterApp";
import "./app/style.css";
import "./app/responsive.css";
import "./app/terrain.css";
import "./app/battle.css";
createRoot(document.getElementById("root")!).render(<CharacterApp />);
