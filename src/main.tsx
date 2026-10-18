import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import "./app/styles/tokens.css";
import "./app/styles/base.css";
import "./app/styles/app.css";
import "./app/styles/scene.css";

const container = document.getElementById("root");
if (!container) throw new Error("main：找不到 #root 挂载点");

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
