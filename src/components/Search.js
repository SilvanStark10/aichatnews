export function Search({ onSearch, currentChatId, isGenerating, onCancel }) {
  const { useState, useEffect, useRef } = React;
  const [searchTerm, setSearchTerm] = useState("");
  const [fileNames, setFileNames] = useState([]);
  const textareaRef = useRef(null);
  const [isEmptyChat, setIsEmptyChat] = useState(false);

  // New states to keep track of a pending submission and hold the locked text.
  const [pendingSubmission, setPendingSubmission] = useState(false);
  const [queuedMessage, setQueuedMessage] = useState("");

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.focus({ preventScroll: true });
    }
  }, []);

  // Check if this is an empty chat on desktop
  useEffect(() => {
    setIsEmptyChat(window.currentTweets?.length === 0 && 
                  window.innerWidth >= 600 && 
                  window.location.pathname === "/");
  }, [window.currentTweets]);

  // When generation finishes and we have queued text, send that queued message.
  useEffect(() => {
    if (!isGenerating && pendingSubmission && queuedMessage.trim().length >= 1) {
      onSearch(queuedMessage);
      setQueuedMessage("");
      // Reset the textarea height and inputmode.
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
        textareaRef.current.setAttribute("inputmode", "none");
        textareaRef.current.focus();
      }
      setPendingSubmission(false);
    }
  }, [isGenerating, pendingSubmission, queuedMessage, onSearch]);

  const handleSubmit = (e) => {
    e.preventDefault();
    const trimmedTerm = searchTerm.trim();
    if (!isGenerating && trimmedTerm.length >= 1) {
      // Get the last visible tweet's ID as the parent
      const tweets = window.currentTweets || [];
      const lastVisibleTweet = tweets[tweets.length - 1];
      // Use the current version's ID, not the original or latest version
      const parentId = lastVisibleTweet ? lastVisibleTweet.id : null;
      
      onSearch(trimmedTerm, parentId);
      setSearchTerm("");
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
        textareaRef.current.setAttribute("inputmode", "none");
        textareaRef.current.focus();
      }
    } else if (isGenerating && trimmedTerm.length >= 1) {
      // Lock in the text immediately as a pending submission and clear the area.
      setQueuedMessage(trimmedTerm);
      setSearchTerm("");  // Immediately clear the textarea so further typing doesn't modify the queued text.
      setPendingSubmission(true);
    }
  };

  const handleKeyDown = (e) => {
    if (window.innerWidth > 599 && e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return React.createElement(
    React.Fragment,
    null,
    // Headline for empty chats on desktop
    isEmptyChat && React.createElement(
      "div", 
      { style: { textAlign: "center", marginBottom: "20px", color: "black", fontWeight: "600", fontSize: "30px" } },
      "Wie kann ich dir helfen?"
    ),
    React.createElement(
      "div",
      { className: "search-container" },
      React.createElement(
        "form",
        { onSubmit: handleSubmit, className: "search-form" },
        fileNames.length > 0 &&
          React.createElement(
            "div",
            { className: "file-names-container" },
            fileNames.map((fileName, index) =>
              React.createElement(
                "div",
                { key: index, className: "file-name" },
                fileName.length > 16
                  ? `${fileName.slice(0, 16)}...${fileName.slice(-4)}`
                  : fileName
              )
            )
          ),
        React.createElement("textarea", {
          ref: textareaRef,
          value: searchTerm,
          onFocus: () => {
            window.inputFocused = true;
          },
          onBlur: () => {
            window.inputFocused = false;
          },
          onChange: (e) => {
            setSearchTerm(e.target.value);
            if (textareaRef.current) {
              textareaRef.current.style.height = "auto";
              textareaRef.current.style.height =
                textareaRef.current.scrollHeight + "px";
            }
          },
          onKeyDown: handleKeyDown,
          placeholder: "Stelle irgendeine Frage",
          className: "search-input",
          rows: 1,
          onClick: () => {
            if (textareaRef.current) {
              textareaRef.current.removeAttribute("inputmode");
            }
          },
        }),
        React.createElement(
          "div",
          { className: "input-button-group" },
          React.createElement(
            "button",
            { type: "button", className: "upload-button", style: { display: "flex", opacity: 0 } },
            React.createElement(
              "svg",
              {
                width: 22,
                height: 22,
                viewBox: "0 0 24 24",
                style: { color: "#c9c9c9" },
                xmlns: "http://www.w3.org/2000/svg",
              },
              React.createElement("path", {
                fill: "currentColor",
                d: "M9 7C9 4.23858 11.2386 2 14 2C16.7614 2 19 4.23858 19 7V15C19 18.866 15.866 22 12 22C8.13401 22 5 18.866 5 15V9C5 8.44772 5.44772 8 6 8C6.55228 8 7 8.44772 7 9V15C7 17.7614 9.23858 20 12 20C14.7614 20 17 17.7614 17 15V7C17 5.34315 15.6569 4 14 4C12.3431 4 11 5.34315 11 7V15C11 15.5523 11.4477 16 12 16C12.5523 16 13 15.5523 13 15V9C13 8.44772 13.4477 8 14 8C14.5523 8 15 8.44772 15 9V15C15 16.6569 13.6569 18 12 18C10.3431 18 9 16.6569 9 15V7Z",
              })
            )
          ),
          React.createElement(
            "button",
            {
              type: "submit",
              className: "search-button",
              disabled: !isGenerating && !searchTerm.trim().length,
              onClick: isGenerating
                ? (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onCancel();
                  }
                : (e) => handleSubmit(e),
              style: {
                opacity: isGenerating
                  ? 1
                  : searchTerm.trim().length < 1
                  ? 1
                  : 1,
                backgroundColor: searchTerm.trim().length < 1 ? '#0d6efd' : '#0d6efd',
              },
            },
            isGenerating
              ? React.createElement(
                  "svg",
                  {
                    xmlns: "http://www.w3.org/2000/svg",
                    viewBox: "0 0 24 24",
                    width: 20,
                    height: 20,
                    className: "search-icon",
                  },
                  React.createElement("rect", {
                    x: "4",
                    y: "4",
                    width: "16",
                    height: "16",
                    fill: "white",
                    rx: "3",
                    ry: "3",
                  })
                )
              : React.createElement(
                  "svg",
                  {
                    xmlns: "http://www.w3.org/2000/svg",
                    viewBox: "0 0 384 512",
                    className: "search-icon",
                  },
                  React.createElement("path", {
                    d: "M214.6 41.4c-12.5-12.5-32.8-12.5-45.3 0l-160 160c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L160 141.2 160 448c0 17.7 14.3 32 32 32s32-14.3 32-32l0-306.7L329.4 246.6c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3l-160-160z",
                    fill: "white",
                  })
                )
          )
        )
      )
    )
  );
} 