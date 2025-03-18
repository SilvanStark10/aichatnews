import { handleEditTweet } from "./EditTweet.js";

export function Tweet({ tweet, isLast, tweetIndex, className, onCancel, onSaveEdit, onDelete, debug }) {
    const { useState, useEffect, useRef } = React;
  
    // Helper: split text into paragraphs and bold segments wrapped in **..**
    const formatContent = (content) => {
      if (!content || typeof content !== "string") return "";
      return content.split("\n").map((line, index) => {
        const parts = line.split(/(\*\*.*?\*\*)/g);
        return React.createElement(
          "p",
          { key: index, className: line.trim() === "" ? "empty" : "" },
          parts.map((part, i) => {
            if (part.startsWith("**") && part.endsWith("**")) {
              return React.createElement("strong", { key: i }, part.slice(2, -2));
            }
            return part;
          })
        );
      });
    };
  
    const [isEditing, setIsEditing] = useState(false);
    const [editedInput, setEditedInput] = useState(tweet.input);
    const [currentInput, setCurrentInput] = useState(tweet.input);
    const [currentResponse, setCurrentResponse] = useState(tweet.content);
    const [showMySQLEntry, setShowMySQLEntry] = useState(false);
    const [mysqlData, setMysqlData] = useState(null);
    const [currentVersion, setCurrentVersion] = useState(null);
  
    useEffect(() => {
      setCurrentInput(tweet.input);
      setCurrentResponse(tweet.content);

      // If an optimistic MySQL entry exists on the tweet, update state immediately.
      if (tweet.mysqlData) {
        setMysqlData(tweet.mysqlData);
        setShowMySQLEntry(true);
        return;
      }

      // Only attempt to fetch MySQL data if we have a tweet ID
      if (tweet.id) {
        const fetchData = () => {
          fetch(`https://goldpluto.com/api/app/requestposts?chat_id=${tweet.chat_id}`)
            .then(response => response.json())
            .then(data => {
              const tweetData = data.posts.find(post => post.ID === tweet.id);
              if (tweetData) {
                setMysqlData({
                  ID: tweetData.ID,
                  ChatID: tweetData.ChatID,
                  Input: tweetData.Input,
                  Response: tweetData.Response,
                  CreatedAt: tweetData.CreatedAt,
                  ParentID: tweetData.ParentID || 'N/A',
                  OriginalID: tweetData.OriginalID || 'N/A',
                  Version: tweetData.Version,
                  TotalVersions: tweetData.TotalVersions
                });
                setShowMySQLEntry(true);
              }
            })
            .catch(error => console.error("Error fetching MySQL data:", error));
        };

        if (tweet.isGenerating) {
          // For new tweets that are generating, poll every second until generation is complete
          const interval = setInterval(() => {
            if (!tweet.isGenerating) {
              fetchData();
              clearInterval(interval);
            }
          }, 1000);
          return () => clearInterval(interval);
        } else {
          // For existing tweets or after generation is complete
          fetchData();
        }
      }
    }, [tweet.input, tweet.content, tweet.id, tweet.isGenerating, tweet.chat_id, tweet.mysqlData]);
  
    useEffect(() => {
      if (mysqlData && mysqlData.Version) {
        setCurrentVersion(parseInt(mysqlData.Version));
      }
    }, [mysqlData]);
  
    const editTextAreaRef = useRef(null);
  
    const handleCancelEdit = () => {
      setEditedInput(currentInput);
      setIsEditing(false);
    };
  
    const handleSaveEdit = () => {
        handleEditTweet({
            tweet: { ...tweet, input: editedInput },
            tweetIndex,
            currentInput,
            setCurrentInput,
            setCurrentResponse,
            onSaveEdit,
            edit_id: tweet.id,
            chat_id: tweet.chat_id
        });
        // Update parent's tweet state with the new input text to reflect the edit
        window.updateTweetState(tweetIndex, { input: editedInput });
        setIsEditing(false);
    };
  
    const handleClose = () => {
      const tweetEl = document.getElementById(`tweet-${tweet.id}`);
      if (tweetEl) tweetEl.style.display = "none";
      fetch("https://goldpluto.com/api/app/closepost", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ post_id: tweet.id, closed: 1 }),
      }).catch((error) => console.error("Error closing post:", error));
    };
  
    const handleThreeDots = (e) => {
      e.stopPropagation();
      console.log("Three dots clicked for tweet:", tweet.id);
    };
  
    const handleCopy = (e) => {
      e.stopPropagation();
      if (currentResponse) {
        navigator.clipboard
          .writeText(currentResponse)
          .then(() => {
            console.log("Copied to clipboard");
          })
          .catch((error) => {
            console.error("Error copying text:", error);
          });
      }
    };
  
    const renderVersionNavigation = () => {
      const maxVersion =
        mysqlData && mysqlData.TotalVersions
          ? parseInt(mysqlData.TotalVersions)
          : 1;
      if (maxVersion <= 1) return null;
      
      const handleVersionChange = (newVersion) => {
        setCurrentVersion(newVersion);
        
        const getCookie = (name) => {
          const value = `; ${document.cookie}`;
          const parts = value.split(`; ${name}=`);
          if (parts.length === 2) return parts.pop().split(";").shift();
        };
        
        const sessionId = getCookie("user_session_id") || "";
        const originalId = (mysqlData && mysqlData.OriginalID && mysqlData.OriginalID !== 'N/A')
          ? mysqlData.OriginalID
          : (tweet.original_id !== 'N/A' ? tweet.original_id : tweet.id);
        
        const url = `https://goldpluto.com/api/app/editpost?session_id=${sessionId}&chat_id=${tweet.chat_id}&original_id=${originalId}&version=${newVersion}`;
        
        fetch(url)
          .then(response => {
            if (!response.ok) throw new Error("Network response was not ok");
            return response.json();
          })
          .then(data => {
            if (data.tweets && data.tweets.length > 0) {
              const formattedPosts = data.tweets.map(item => ({
                id: item.ID,
                chat_id: item.ChatID,
                input: item.Input,
                content: item.Response,
                createdAt: item.CreatedAt,
                isGenerating: false,
                parent_id: item.ParentID || 'N/A',
                original_id: item.OriginalID || 'N/A',
                mysqlData: item
              }));

              // Update current tweet's content without replacing the entire component
              window.updateTweetState(tweetIndex, {
                id: formattedPosts[0].id,
                input: formattedPosts[0].input,
                content: formattedPosts[0].content,
                mysqlData: formattedPosts[0].mysqlData
              });

              // Handle subsequent tweets
              if (formattedPosts.length > 1) {
                // Get existing tweet containers after current tweet
                const existingTweets = window.currentTweets.slice(tweetIndex + 1);
                const newTweets = formattedPosts.slice(1);

                // Update existing tweet containers with new content
                newTweets.forEach((newTweet, i) => {
                  if (i < existingTweets.length) {
                    // Update existing tweet container
                    window.updateTweetState(tweetIndex + 1 + i, newTweet);
                  } else {
                    // Add new tweet container if needed
                    window.addTweet(newTweet);
                  }
                });

                // Remove excess tweet containers
                if (existingTweets.length > newTweets.length) {
                  window.removeTweets(tweetIndex + 1 + newTweets.length);
                }
              } else {
                // No subsequent tweets in response, remove all tweets below current
                window.removeTweets(tweetIndex + 1);
              }
            }
          })
          .catch(error => console.error("Error fetching updated tweet chain:", error));
      };
      
      return React.createElement(
        "div",
        {
          className: "version-navigation",
          style: {
            display: "flex",
            alignItems: "center",
            gap: "8px",
            marginLeft: "auto",
            marginTop: "4px",
            color: "#666",
            fontSize: "14px"
          }
        },
        React.createElement(
          "svg",
          {
            viewBox: "0 0 24 24",
            width: "16",
            height: "16",
            fill: "currentColor",
            style: { cursor: currentVersion > 1 ? "pointer" : "default" },
            onClick: () => { if (currentVersion > 1) handleVersionChange(currentVersion - 1); }
          },
          React.createElement("use", { xlinkHref: "src/public/styles/icons.svg#icon-left-arrow" })
        ),
        React.createElement(
          "span",
          null,
          `${currentVersion}/${maxVersion}`
        ),
        React.createElement(
          "svg",
          {
            viewBox: "0 0 24 24",
            width: "16",
            height: "16",
            fill: "currentColor",
            style: { cursor: currentVersion < maxVersion ? "pointer" : "default" },
            onClick: () => { if (currentVersion < maxVersion) handleVersionChange(currentVersion + 1); }
          },
          React.createElement("use", { xlinkHref: "src/public/styles/icons.svg#icon-right-arrow" })
        )
      );
    };
  
    // Build the main tweet element.
    const tweetElement = React.createElement(
      "div",
      { 
        id: `tweet-${tweet.id}`, 
        className: `tweet ${className} ${isLast ? "last" : ""}`, 
        style: { position: "relative", border: "none" } 
      },
      tweet.input &&
        (isEditing
          ? React.createElement(
              "div",
              { className: "tweet-input-container editing", style: { width: "100%", position: "relative" } },
              React.createElement("textarea", {
                ref: editTextAreaRef,
                value: editedInput,
                onChange: (e) => {
                  setEditedInput(e.target.value);
                  if (editTextAreaRef.current) {
                    editTextAreaRef.current.style.height = "auto";
                    editTextAreaRef.current.style.height = editTextAreaRef.current.scrollHeight + "px";
                  }
                },
                style: {
                  width: "100%",
                  maxWidth: "100%",
                  resize: "none",
                  border: "none",
                  padding: "5px 10px",
                  backgroundColor: "rgb(244, 244, 244)",
                },
                rows: 3,
              }),
              React.createElement(
                "div",
                {
                  style: {
                    display: "flex",
                    alignItems: "flex-end",
                    gap: "7.5px",
                    marginTop: "3px",
                    marginBottom: "10px",
                    marginRight: "10px",
                  },
                },
                React.createElement(
                  "button",
                  {
                    onClick: handleCancelEdit,
                    style: {
                      padding: "5px 10px",
                      cursor: "pointer",
                      backgroundColor: "white",
                      border: "0.7px solid #e5e7eb",
                      borderRadius: "24px",
                    },
                  },
                  "Cancel"
                ),
                React.createElement(
                  "button",
                  {
                    onClick: handleSaveEdit,
                    style: {
                      padding: "5px 10px",
                      cursor: "pointer",
                      backgroundColor: "#4d6bfe",
                      color: "white",
                      border: "none",
                      borderRadius: "24px",
                    },
                  },
                  "Save"
                )
              )
            )
          : React.createElement(
              "div",
              { className: "tweet-input-container", style: { 
                  position: "relative", 
                  display: "flex", 
                  flexDirection: "column", 
                  gap: "8px", 
                  alignItems: "flex-end",
                  marginLeft: "auto",
                  maxWidth: "80%"
                } },
              React.createElement(
                "div",
                { className: "tweet-input-wrapper", style: { display: "flex", width: "100%", justifyContent: "flex-end" } },
                React.createElement(
                  "div",
                  {
                    className: "edit-icon",
                    style: { 
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      marginRight: "10px"
                    },
                    onClick: () => setIsEditing(true),
                  },
                  React.createElement(
                    "svg",
                    { viewBox: "0 0 24 24", width: "16", height: "16", fill: "currentColor" },
                    React.createElement("use", { xlinkHref: "src/public/styles/icons.svg#icon-edit" })
                  )
                ),
                React.createElement(
                  "div",
                  { 
                    className: "tweet-input", 
                    style: { 
                      padding: "8px 18px", 
                      borderRadius: "19px", 
                      textAlign: "left", 
                      border: "none",
                      display: "inline-block",
                      maxWidth: "100%",
                      backgroundColor: "#f4f4f4"
                    } 
                  },
                  formatContent(currentInput)
                )
              ),
              // Add version navigation if mysqlData exists and more than 1 total version exists
              mysqlData && parseInt(mysqlData.TotalVersions) > 1 && renderVersionNavigation()
            )
        ),
      showMySQLEntry && mysqlData && React.createElement(
        "div",
        { className: "tweet-mysql-entry", style: { display: "none", padding: "10px", border: "1px solid #ddd", borderRadius: "4px", marginTop: "10px" } },
        React.createElement("h4", null, "MySQL Entry:"),
        React.createElement("pre", null, JSON.stringify(mysqlData, null, 2))
      ),
      React.createElement(
        "div",
        { className: "tweet-content", style: { paddingTop: "20px", border: "none" } },
        formatContent(currentResponse),
        currentResponse &&
          React.createElement(
            "div",
            { 
              className: "copy-icon", 
              style: { 
                  display: "flex", 
                  alignItems: "center", 
                  WebkitTapHighlightColor: "transparent"
              }
            },
            React.createElement(
              "svg",
              { 
                className: "tweet-icon", 
                viewBox: "0 0 24 24", 
                fill: "currentColor", 
                xmlns: "http://www.w3.org/2000/svg",
                onClick: handleCopy,
                title: "Copy response",
                style: { 
                  cursor: "pointer",
                  WebkitTapHighlightColor: "transparent"
                }
              },
              React.createElement("use", { xlinkHref: "src/public/styles/icons.svg#icon-copy" })
            ),
            React.createElement(
              "svg",
              { 
                className: "tweet-icon icon-like", 
                viewBox: "0 0 24 24", 
                fill: "currentColor", 
                xmlns: "http://www.w3.org/2000/svg",
                style: { 
                  cursor: "pointer",
                  WebkitTapHighlightColor: "transparent"
                }
              },
              React.createElement("use", { xlinkHref: "src/public/styles/icons.svg#icon-like" })
            ),
            React.createElement(
              "svg",
              { 
                className: "tweet-icon icon-like", 
                viewBox: "0 0 24 24", 
                fill: "currentColor", 
                xmlns: "http://www.w3.org/2000/svg",
                style: { 
                  cursor: "pointer",
                  WebkitTapHighlightColor: "transparent"
                }
              },
              React.createElement("use", { xlinkHref: "src/public/styles/icons.svg#icon-dislike" })
            )
          )
      )
    );
  
    return tweetElement;
}
