import { Search } from "./components/Search.js";
import { Tweet } from "./components/Tweet.js?v=1111";
import { ScrollDownButton } from "./components/ScrollDownButton.js";
import { getCookie } from "./utils/getCookie.js";

function updateMobileChatName(chatId) {
  const mobileChatName = document.getElementById("mobile-chat-name");
  if (mobileChatName) {
    mobileChatName.innerText = chatId ? `Chat ${chatId}` : "";
  }
}

export function infinitefeed() {
  const { useState, useEffect, useRef, useLayoutEffect } = React;
  const [tweets, setTweets] = useState([]);
  const [currentChatId, setCurrentChatId] = useState(null);
  const [chatCount, setChatCount] = useState(2);
  const [isCreatingChat, setIsCreatingChat] = useState(false);
  const [searchBarStyle, setSearchBarStyle] = useState({});
  const [shouldScroll, setShouldScroll] = useState(true);
  const [showScrollDown, setShowScrollDown] = useState(false);
  const [manualScrolling, setManualScrolling] = useState(false);
  const manualScrollingRef = useRef(manualScrolling);
  const [tweetsToDelete, setTweetsToDelete] = useState(new Set());
  const [queuedMessage, setQueuedMessage] = useState(null);
  const abortControllerRef = useRef(null);
  const [showDebug, setShowDebug] = useState(true);

  useEffect(() => {
    manualScrollingRef.current = manualScrolling;
  }, [manualScrolling]);

  // Disable auto scroll when user touches or uses the wheel.
  useEffect(() => {
    const handleUserScroll = () => {
      setManualScrolling(true);
    };
    window.addEventListener("touchstart", handleUserScroll, { passive: true });
    window.addEventListener("wheel", handleUserScroll, { passive: true });
    return () => {
      window.removeEventListener("touchstart", handleUserScroll);
      window.removeEventListener("wheel", handleUserScroll);
    };
  }, []);

  useEffect(() => {
    const handleScroll = () => {
      const scrollPosition = window.scrollY + window.innerHeight;
      const totalHeight = document.documentElement.scrollHeight;
      if (totalHeight - scrollPosition < 100) {
        setShouldScroll(true);
        setShowScrollDown(false);
      } else {
        setShouldScroll(false);
        setShowScrollDown(totalHeight > window.innerHeight + 100);
      }
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Add new effect to check URL on load
  useEffect(() => {
    const path = window.location.pathname;
    if (path === "/") {
      // Homepage: fetch chat IDs so that a new chat button is added.
      fetchUserIPAddresses().then(({ userIpV4, userIpV6 }) => {
        fetch(`https://goldpluto.com/api/app/chatids?ipv6=${userIpV6}`)
          .then((response) => response.json())
          .then((chatData) => {
            if (chatData && chatData.length > 0) {
              setCurrentChatId(chatData[0].ChatID);
            } else {
              setCurrentChatId(1);
            }
          })
          .catch((error) => console.error("Error fetching chat IDs:", error));
      });
    } else if (path.length === 39 && path.startsWith('/')) {
      // Chat URL case: load posts for the specific chat URL
      const chatUrl = path.substring(1); // Remove leading slash
      fetch(`https://goldpluto.com/api/app/requestposts?chat_url=${chatUrl}`)
        .then((response) => response.json())
        .then((chatData) => {
          if (chatData && chatData.chat_id) {
            setCurrentChatId(chatData.chat_id);
            // Don't modify URL here - keep the existing URL
          } else {
            // Only redirect to homepage if no chat was found,
            // now using a full navigation to ensure the URL switches to goldpluto.com.
            window.location.replace('/');
          }
        })
        .catch((error) => console.error("Error fetching chat by URL:", error));
    }
  }, []);

  useEffect(() => {
    if (currentChatId) {
      updateMobileChatName(currentChatId);
    }
  }, [currentChatId]);

  // Load tweets when currentChatId updates.
  useEffect(() => {
    if (currentChatId) {
      loadTweets(currentChatId);
    }
  }, [currentChatId]);

  useEffect(() => {
    if (!getCookie("user_session_id") && !getCookie("saves_your_work")) {
      console.log("No session or temporary cookie found");
    }
    loadTweets(currentChatId);
  }, [currentChatId]);

  // Keep current tweets globally.
  useEffect(() => {
    window.currentTweets = tweets;
  }, [tweets]);

  const loadTweets = (chatId) => {
    if (!chatId || chatId === "null") return;
    fetchUserIPAddresses()
      .then(({ userIpV4, userIpV6 }) => {
        const sessionId = getCookie("user_session_id");
        const url = `https://goldpluto.com/api/app/requestposts?session_id=${sessionId}&chat_id=${chatId}`;
        console.log(`Fetching tweets from: ${url}`);
        fetch(url)
          .then((response) => {
            if (!response.ok) {
              throw new Error("Network response was not ok");
            }
            return response.json();
          })
          .then((data) => {
            const formattedTweets = data.posts.map((item) => ({
              id: item.ID,
              chat_id: item.ChatID,
              input: item.Input,
              content: item.Response,
              createdAt: item.CreatedAt,
              isGenerating: false,
              parent_id: item.ParentID || 'N/A',
              original_id: item.OriginalID || 'N/A',
              chat_url: item.ChatURL,
              version: item.Version,
              totalVersions: item.TotalVersions
            }));
            // Sort tweets (oldest first)
            formattedTweets.sort(
              (a, b) => new Date(a.createdAt) - new Date(b.createdAt)
            );
            setTweets(formattedTweets);
            
            // Update URL based on tweets length and chat_url
            if (window.location.pathname === "/") {
              if (formattedTweets.length > 0 && formattedTweets[0].chat_url) {
                window.history.replaceState({}, '', `/${formattedTweets[0].chat_url}`);
              } else {
                window.history.replaceState({}, '', '/');
              }
            }
          })
          .catch((error) =>
            console.error("Error fetching data:", error)
          );
      })
      .catch((error) =>
        console.error("Error fetching IP addresses:", error)
      );
  };

  // Callback to be called when a tweet is saved.
  // This removes any tweets (responses/inputs) below the edited tweet.
  const handleSaveEdit = (tweetIndex, isGenerating) => {
    setTweets((prevTweets) => {
      // Create a copy of tweets up to the edited tweet
      const updatedTweets = prevTweets.slice(0, tweetIndex + 1);
      
      // Update the isGenerating state of the edited tweet if applicable
      if (isGenerating !== undefined && updatedTweets[tweetIndex]) {
        updatedTweets[tweetIndex] = {
          ...updatedTweets[tweetIndex],
          isGenerating: isGenerating,
        };
      }
      
      return updatedTweets.length ? updatedTweets : prevTweets;
    });
  };

  // Cancel current generation by aborting the fetch request.
  const cancelCurrentGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      // Instead of updating the tweet's content, remove the tweet completely.
      setTweets((prevTweets) =>
        prevTweets.filter((tweet) => !tweet.isGenerating)
      );
    }
  };

  const handleSearch = (searchTerm) => {
    setManualScrolling(false);
    const tempId = Date.now();
    
    // Get the last visible tweet's ID as the parent
    const lastVisibleTweet = tweets[tweets.length - 1];
    const parentId = lastVisibleTweet ? lastVisibleTweet.id : null;

    const optimisticTweet = {
      id: tempId,
      input: searchTerm,
      content: "",
      createdAt: new Date().toISOString(),
      isGenerating: true,
      parent_id: parentId // Add parent_id to the optimistic tweet
    };

    // Append the new optimistic tweet
    setTweets((prevTweets) => [...prevTweets, optimisticTweet]);

    // Scroll to the new tweet so that it appears at the top.
    setTimeout(() => {
      const newTweetEl = document.getElementById(`tweet-${tempId}`);
      if (newTweetEl) {
        let targetGap = 7;
        if (window.innerWidth <= 599) {
          const mobileNav = document.querySelector(".mobile-top-nav");
          targetGap = mobileNav ? mobileNav.getBoundingClientRect().bottom + 7 : 7;
        } else {
          const nav = document.querySelector(".navigation");
          targetGap = nav ? nav.getBoundingClientRect().bottom + 7 : 7;
        }
        newTweetEl.scrollIntoView({ behavior: "smooth", block: "start" });
        setTimeout(() => {
          window.scrollBy(0, -targetGap);
        }, 300);
      }
    }, 150);

    // Create a new AbortController for this request
    abortControllerRef.current = new AbortController();

    // Send the message to the server with the parent_id
    fetchUserIPAddresses()
      .then(({ userIpV4, userIpV6 }) => {
        const url = `https://goldpluto.com/api/app/newpost?ipv4=${userIpV4}&ipv6=${userIpV6}`;
        fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ 
            message: searchTerm, 
            chat_id: currentChatId,
            parent_id: parentId // Include parent_id in the request
          }),
          credentials: "include",
          signal: abortControllerRef.current.signal,
        })
          .then((response) => {
            if (!response.ok) {
              return response.text().then((text) => {
                throw new Error(text || "Server Error");
              });
            }
            return response.json();
          })
          .then((data) => {
            // Now also pick up the groq_payload and chat id from the server response.
            const responseText = data.response;
            const groqPayload = data.groq_payload;
            const newTweetId = data.debug_info.db_info.original_id;
            const updatedChatId = data.debug_info.chat_id;
            setTweets((prevTweets) =>
              prevTweets.map((tweet) =>
                tweet.id === tempId
                  ? { 
                      ...tweet, 
                      id: newTweetId, 
                      chat_id: updatedChatId,
                      content: responseText, 
                      isGenerating: false, 
                      groqPayload,
                      chat_url: data.debug_info.db_info.chat_url,
                      mysqlData: data.mysql_data  // Add the MySQL data to the tweet
                    }
                  : tweet
              )
            );
            abortControllerRef.current = null;
            
            // Update URL with the ChatURL from the response
            if (data.debug_info && data.debug_info.db_info && data.debug_info.db_info.chat_url) {
              window.history.replaceState({}, '', `/${data.debug_info.db_info.chat_url}`);
            }
          })
          .catch((error) => {
            if (error.name === "AbortError") {
              console.log("Message generation canceled.");
            } else {
              console.error("Error:", error);
              setTweets((prevTweets) =>
                prevTweets.map((tweet) =>
                  tweet.id === tempId
                    ? { ...tweet, content: "Error retrieving response", isGenerating: false }
                    : tweet
                )
              );
            }
            abortControllerRef.current = null;
          });
      })
      .catch((error) =>
        console.error("Error fetching IP addresses:", error)
      );
  };

  const switchChat = (chatId) => {
    setCurrentChatId(chatId);
    updateMobileChatName(chatId);

    // New code: Update URL by fetching the latest ChatURL for the chat
    fetch(`https://goldpluto.com/api/app/requestposts?chat_id=${chatId}`, {
      credentials: "include"
    })
      .then((response) => response.json())
      .then((data) => {
        if (data.posts && data.posts.length > 0 && data.posts[0].ChatURL) {
          window.history.pushState({}, '', `/${data.posts[0].ChatURL}`);
        } else {
          // For new chats or if no ChatURL is found, explicitly reset URL to the homepage.
          window.history.pushState({}, '', '/');
        }
      })
      .catch((error) => console.error("Error updating URL:", error));

    setTimeout(() => {
      const searchInput = document.querySelector(".search-input");
      if (searchInput) {
        searchInput.focus();
      }
    }, 100);
  };

  const createNewChat = () => {
    if (isCreatingChat) {
      return;
    }
    if (tweets.length === 0) {
      console.warn("Current chat is empty. No new chat created.");
      return;
    }
    setIsCreatingChat(true);
    fetchUserIPAddresses()
      .then(({ userIpV4, userIpV6 }) => {
        fetch(`https://goldpluto.com/api/app/chatids?ipv6=${userIpV6}`)
          .then((response) => response.json())
          .then((chatData) => {
            const existingChatIds = chatData.map((chat) => chat.ChatID);
            let newChatId = 1;
            while (existingChatIds.includes(newChatId)) {
              newChatId++;
            }
            setChatCount(newChatId);
            const chatButtonsContainer = document.getElementById("chat-buttons-container");
            // New code: Prevent duplicate chat button creation
            let newButton = chatButtonsContainer.querySelector(`button[data-chat-id="${newChatId}"]`);
            if (!newButton) {
              newButton = document.createElement("button");
              newButton.innerText = `Chat ${newChatId}`;
              newButton.className = "chat-button";
              newButton.setAttribute("data-chat-id", newChatId);
              newButton.onclick = () => switchChat(newChatId);
              if (chatButtonsContainer.firstChild) {
                chatButtonsContainer.insertBefore(newButton, chatButtonsContainer.firstChild);
              } else {
                chatButtonsContainer.appendChild(newButton);
              }
            }
            switchChat(newChatId);
          })
          .catch((error) => console.error("Error fetching chat IDs:", error))
          .finally(() => {
            setIsCreatingChat(false);
          });
      })
      .catch((error) => {
        console.error("Error fetching IP addresses:", error);
        setIsCreatingChat(false);
      });
  };

  useLayoutEffect(() => {
    const updateSearchBarStyle = () => {
      const mainContent = document.querySelector(".main-content");
      if (mainContent) {
        const rect = mainContent.getBoundingClientRect();
        const style = {
          position: "fixed",
          left: rect.left + "px",
          width: rect.width + "px",
          zIndex: 1001,
          backgroundColor: "white",
        };
        // On homepage with an empty feed, center the search container vertically.
        // Otherwise (for chat URL visits), fix it at the bottom immediately.
        if (tweets.length === 0 && window.innerWidth >= 600 && window.location.pathname === "/") {
          style.top = "50%";
          style.transform = "translateY(-50%)";
        } else {
          style.bottom = "0px";
        }
        setSearchBarStyle(style);
      }
    };
    updateSearchBarStyle();
    window.addEventListener("resize", updateSearchBarStyle);
    return () => window.removeEventListener("resize", updateSearchBarStyle);
  }, [tweets]);

  // If any tweet is still generating, periodically auto-scroll.
  useEffect(() => {
    let scrollInterval = null;
    if (tweets.some((tweet) => tweet.isGenerating)) {
      scrollInterval = setInterval(() => {
        if (shouldScroll && !manualScrollingRef.current) {
          window.scrollTo({
            top: document.documentElement.scrollHeight,
            behavior: "smooth",
          });
        }
      }, 300);
    }
    return () => {
      if (scrollInterval) clearInterval(scrollInterval);
    };
  }, [tweets, shouldScroll]);

  const handleDeleteTweet = (tweetId) => {
    // Add the current tweet and all subsequent tweets to the delete set
    const index = tweets.findIndex(t => t.id === tweetId);
    if (index !== -1) {
        const idsToDelete = tweets.slice(index).map(t => t.id);
        setTweetsToDelete(prevSet => new Set([...prevSet, ...idsToDelete]));
    }
  };

  // Expose functions to the global scope for non-React code.
  window.switchChat = switchChat;
  window.createNewChat = createNewChat;

  // Expose function to update a tweet at a given index (used for editing)
  window.updateTweetState = (tweetIndex, updatedData) => {
    setTweets(prevTweets => {
      const newTweets = [...prevTweets];
      if (newTweets[tweetIndex]) {
        newTweets[tweetIndex] = {
          ...newTweets[tweetIndex],
          ...updatedData
        };
      }
      return newTweets;
    });
  };

  // New code: expose function to replace tweet chain from a given index.
  // When a version change is requested, this function will remove the tweet (where the arrow was clicked)
  // and any subsequent tweets, replacing them with the newly fetched tweets from tweets.py.
  window.replaceTweetChain = (startIndex, newTweets) => {
    setTweets(prevTweets => {
      const updatedTweets = [...prevTweets];
      // Remove tweets from startIndex onwards
      updatedTweets.splice(startIndex);
      // Add new tweets
      updatedTweets.push(...newTweets);
      return updatedTweets;
    });
  };

  // Expose function to add a new tweet
  window.addTweet = (tweetData) => {
    setTweets(prevTweets => [...prevTweets, tweetData]);
  };

  // Expose function to remove tweets from startIndex onwards
  window.removeTweets = (startIndex) => {
    setTweets(prevTweets => prevTweets.slice(0, startIndex));
  };

  return React.createElement(
    React.Fragment,
    null,
    // Debug toggle button. You might style and position this as needed.
    // Remove the button if you don't want it anymore
    // React.createElement(
    //   "div",
    //   { style: { position: "fixed", top: "5px", right: "5px", zIndex: 2000 } },
    //   React.createElement(
    //     "button",
    //     { onClick: () => setShowDebug((prev) => !prev) },
    //     showDebug ? "Hide Debug Info" : "Show Debug Info"
    //   )
    // ),
    React.createElement(
      "div",
      { className: "min-h-screen", style: { paddingBottom: "150px" } },
      React.createElement(
        "div",
        { className: "container" },
        tweets.map((tweet, index) => {
          if (tweetsToDelete.has(tweet.id)) {
            return null; // Don't render tweets marked for deletion
          }
          return React.createElement(Tweet, {
            key: tweet.id,
            tweet: tweet,
            isLast: index === tweets.length - 1,
            tweetIndex: index,
            className: `${index === 0 ? "first" : ""} ${index === tweets.length - 1 ? "last" : ""}`,
            onSaveEdit: handleSaveEdit,
            onDelete: handleDeleteTweet,
            onCancel: tweet.isGenerating ? cancelCurrentGeneration : undefined,
            // Pass the debug flag to each tweet.
            debug: showDebug,
          });
        })
      ),
      showScrollDown && React.createElement(ScrollDownButton),
      React.createElement(
        "div",
        { className: "fixed-search-container", style: searchBarStyle },
        React.createElement(Search, {
          onSearch: handleSearch,
          currentChatId: currentChatId,
          isGenerating: tweets.some((tweet) => tweet.isGenerating),
          onCancel: cancelCurrentGeneration,
        })
      )
    )
  );
}
