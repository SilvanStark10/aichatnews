import { infinitefeed } from "./infinitefeed.js";
import { setupDiscoverRoute } from "./discover.js";

// Initialize the discover route functionality
setupDiscoverRoute();

// Determine which component to render based on the URL
const renderApp = () => {
  const path = window.location.pathname;
  
  if (path === "/discover") {
    import("./discover.js").then(module => {
      ReactDOM.render(
        React.createElement(module.Discover),
        document.getElementById("root")
      );
    });
  } else {
    ReactDOM.render(
      React.createElement(infinitefeed),
      document.getElementById("root")
    );
  }
};

// Initial render
renderApp();

// Handle browser navigation (back/forward)
window.addEventListener('popstate', renderApp); 