import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import "./tokens.css";
import "./app.css";
import "./landing.css";

const root = document.getElementById("root");
if (root === null) throw new Error("missing #root");
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
