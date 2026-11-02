import { createRoot } from "react-dom/client";
import App from "./app/App";
import "./app/style.css";
import "./app/responsive.css";
import "./app/terrain.css";
createRoot(document.getElementById("root")!).render(<App />);
