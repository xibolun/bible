import React from "react";
import ReactDOM from "react-dom/client";
import BibleApp from "./App";
import { ProjectionWindow } from "./features/projection/ProjectionWindow";
import "./style.css";
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {new URLSearchParams(location.search).has("projection") ? (
      <ProjectionWindow />
    ) : (
      <BibleApp />
    )}
  </React.StrictMode>,
);
