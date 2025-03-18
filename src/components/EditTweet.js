export function handleEditTweet({ tweet, tweetIndex, currentInput, setCurrentInput, setCurrentResponse, onSaveEdit, edit_id, chat_id }) {
    // Remove trailing empty lines
    const lines = tweet.input.split("\n");
    while (lines.length > 0 && lines[lines.length - 1].trim() === "") {
        lines.pop();
    }
    const cleanedInput = lines.join("\n");
    const originalInput = currentInput; // Store original input

    setCurrentInput(cleanedInput);
    setCurrentResponse("");
    
    // Set isGenerating to true before making the API call
    tweet.isGenerating = true;
    
    // Notify parent component about the edit and generation state
    if (onSaveEdit) {
        onSaveEdit(tweetIndex, true);
    }

    // Remove subsequent tweets (if any) and mark the tweet as generating.
    onSaveEdit(tweetIndex, true);
    
    // Ensure that the tweet.input contains the revised text (from the textarea)
    // and then send the edited message to the server.
    fetchUserIPAddresses().then(({ userIpV4, userIpV6 }) => {
        // Get the currently visible parent tweet's ID
        const tweets = window.currentTweets || [];
        const parentTweet = tweets[tweetIndex - 1];
        const parentId = parentTweet ? parentTweet.id : null;

        const url = `https://goldpluto.com/api/app/newpost?ipv4=${userIpV4}&ipv6=${userIpV6}`;
        fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                message: tweet.input,
                chat_id: chat_id,
                edit_id: edit_id,
                parent_id: parentId, // Pass the currently visible parent's ID
            }),
            credentials: "include",
        })
        .then((response) => response.json())
        .then((data) => {
            const responseText = data.response;
            const groqPayload = data.groq_payload;
            const newTweetId = data.debug_info.db_info.original_id;
            const updatedChatId = data.debug_info.chat_id;
            
            // Get the original_id from the existing mysqlData if it exists
            const originalId = tweet.mysqlData?.OriginalID || tweet.original_id || edit_id;
            
            // Calculate new total versions by incrementing the existing count
            const currentTotalVersions = tweet.mysqlData?.TotalVersions || tweet.totalVersions || 1;
            const newTotalVersions = currentTotalVersions + 1;

            window.updateTweetState &&
                window.updateTweetState(tweetIndex, {
                    id: newTweetId,
                    chat_id: updatedChatId,
                    content: responseText,
                    isGenerating: false,
                    groqPayload,
                    original_id: originalId,
                    mysqlData: {
                        ID: newTweetId,
                        ChatID: updatedChatId,
                        Input: tweet.input,
                        Response: responseText,
                        CreatedAt: new Date().toISOString(),
                        ParentID: data.debug_info.db_info.parent_id || 'N/A',
                        OriginalID: originalId,
                        Version: data.debug_info.db_info.version,
                        TotalVersions: newTotalVersions  // Use our locally calculated value
                    }
                });
        })
        .catch((error) => {
            console.error("Error editing tweet:", error);
            window.updateTweetState &&
                window.updateTweetState(tweetIndex, {
                    content: "Error retrieving response",
                    isGenerating: false,
                });
        });
    }).catch((error) => {
        console.error("Error fetching IP addresses:", error);
        window.updateTweetState &&
            window.updateTweetState(tweetIndex, {
                content: "Error fetching IP address",
                isGenerating: false,
            });
    });
} 