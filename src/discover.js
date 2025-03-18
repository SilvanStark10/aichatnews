// Discover component for displaying posts from Elasticsearch
export function Discover() {
    const { useState, useEffect } = React;
    const [posts, setPosts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [page, setPage] = useState(0);
    const [hasMore, setHasMore] = useState(true);
  
    // Load posts from Elasticsearch
    const loadPosts = async () => {
      try {
        setLoading(true);
        const response = await fetch(`https://goldpluto.com/latest?size=200`);
        
        if (!response.ok) {
          throw new Error(`Error: ${response.status}`);
        }
        
        // Check if the response is actually JSON before parsing
        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
          throw new Error('Expected JSON response but received HTML. You might need to log in.');
        }
        
        const data = await response.json();
        
        // If no documents or fewer than requested, there are no more to load
        if (!data.documents || data.documents.length < 20) {
          setHasMore(false);
        }
        
        setPosts(prevPosts => {
          // Filter out duplicates when appending new posts
          const newPosts = [...prevPosts];
          const existingIds = new Set(newPosts.map(post => post.id));
          
          data.documents.forEach(doc => {
            if (!existingIds.has(doc.id)) {
              newPosts.push(doc);
            }
          });
          
          return newPosts;
        });
      } catch (err) {
        setError(err.message);
        console.error("Error loading posts:", err);
      } finally {
        setLoading(false);
      }
    };
  
    // Initial load
    useEffect(() => {
      loadPosts();
      
      // Update the document title
      document.title = "Discover - Tensola";
      
      // Update mobile chat name
      const mobileChatName = document.getElementById("mobile-chat-name");
      if (mobileChatName) {
        mobileChatName.innerText = "Discover";
      }
      
      // Update URL without page reload
      if (window.history && window.location.pathname !== "/discover") {
        window.history.pushState({}, '', '/discover');
      }
    }, []);
  
    // Handle infinite scroll
    const handleScroll = () => {
      if (window.innerHeight + document.documentElement.scrollTop >= document.documentElement.offsetHeight - 100 && !loading && hasMore) {
        setPage(prevPage => prevPage + 1);
        loadPosts();
      }
    };
  
    // Add scroll event listener
    useEffect(() => {
      window.addEventListener('scroll', handleScroll);
      return () => window.removeEventListener('scroll', handleScroll);
    }, [loading, hasMore]);
  
    if (error) {
      return React.createElement(
        "div", 
        { className: "discover-error" },
        React.createElement("p", null, error),
        React.createElement(
          "button", 
          { 
            onClick: () => { setError(null); loadPosts(); },
            className: "retry-button"
          }, 
          "Retry"
        )
      );
    }
  
    return React.createElement(
      "div",
      { className: "discover-container" },
      // Header removed as requested
      React.createElement(
        "div",
        { className: "discover-posts" },
        posts.map(post => 
          React.createElement(
            "div",
            { 
              key: post.id, 
              className: "discover-post",
              style: { marginBottom: "20px" }
            },
            React.createElement(
              "div",
              { className: "discover-post-content" },
              React.createElement("p", { style: { whiteSpace: "pre-wrap" } }, post.text)
            )
          )
        )
      )
    );
  }
  
  // Export a function to handle updating the infinitefeed component
  export function setupDiscoverRoute() {
    // Cache the original switchChat function
    const originalSwitchChat = window.switchChat;
    
    // Override switchChat to handle discover route
    window.switchChat = (chatId) => {
      if (chatId === 16) { // 16 is the discover chat ID as per the sidebar button
        // Hide the search box
        const searchContainer = document.querySelector(".fixed-search-container");
        if (searchContainer) {
          searchContainer.style.display = "none";
        }
        
        // Render the Discover component
        const rootElement = document.getElementById("root");
        ReactDOM.render(React.createElement(Discover), rootElement);
        
        // Update URL to /discover
        window.history.pushState({}, '', '/discover');
        
        // Update mobile chat name
        const mobileChatName = document.getElementById("mobile-chat-name");
        if (mobileChatName) {
          mobileChatName.innerText = "Discover";
        }
        
        // Hide the chat overlay if it's open
        const chatOverlay = document.getElementById("chat-overlay");
        if (chatOverlay) {
          chatOverlay.style.display = "none";
        }
      } else {
        // For other chat IDs, use the original function
        originalSwitchChat(chatId);
        
        // Show the search box again if it was hidden
        const searchContainer = document.querySelector(".fixed-search-container");
        if (searchContainer) {
          searchContainer.style.display = "block";
        }
      }
    };
    
    // Also check on page load if we're on the discover route
    if (window.location.pathname === "/discover") {
      window.switchChat(16);
    }
  }