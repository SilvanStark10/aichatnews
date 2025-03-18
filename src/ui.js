/* src/ui.js – UI Helpers for non‐React functionality */

/* A local (or shared) getCookie function.
   (If you already use src/utils/getCookie.js in your React code, you can also import that there.)
*/
function getCookie(name) {
  const value = "; " + document.cookie;
  const parts = value.split("; " + name + "=");
  if (parts.length === 2) return parts.pop().split(";").shift();
}

function toggleUserInfo() {
  const userFullName = document.getElementById("user-full-name");
  // Using 'block' to match our updated display logic
  userFullName.style.display = userFullName.style.display === "none" ? "block" : "none";
}

function logout() {
  // Clear cookies and reload the page
  document.cookie = "user_session_id=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
  document.cookie = "saves_your_work=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
  location.reload();
}

function displayCookies() {
  const userSessionId = getCookie("user_session_id");
  const savesYourWork = getCookie("saves_your_work");
  const userSessionElem = document.getElementById("user_session_id");
  const savesElem = document.getElementById("saves_your_work");
  if (userSessionElem) {
    userSessionElem.textContent = `user_session_id: ${userSessionId || "Not set"}`;
  }
  if (savesElem) {
    savesElem.textContent = `saves_your_work: ${savesYourWork || "Not set"}`;
  }
}

/* --- Updated: Unified User Info Logic --- */
function updateUserInfo() {
  fetch(`https://goldpluto.com/api/account/userinfo`, {
    method: "GET",
    credentials: "include"
  })
    .then(response => response.json())
    .then(data => {
      const userIcon = document.getElementById("user-icon");
      const userFullName = document.getElementById("user-full-name");
      const userNameSpan = document.getElementById("user-name");
      const userInfo = document.getElementById("user-info");
      const loginText = document.getElementById("login-text");

      if (data.logged_in) {
        userIcon.textContent = data.first_name.charAt(0).toUpperCase();
        userNameSpan.textContent = `${data.first_name} ${data.last_name}`;
        userIcon.style.display = "flex";
        // Toggle the full name display on click
        userIcon.onclick = () => {
          userFullName.style.display = userFullName.style.display === "none" ? "block" : "none";
        };
        if (userInfo) userInfo.style.display = "block";
        if (loginText) loginText.style.display = "none";
      } else {
        if (loginText) loginText.style.display = "block";
      }
    })
    .catch(error => console.error("Error fetching user info:", error));
}
/* --- End Updated Unified User Info Logic --- */

function toggleSettings() {
  const settingsButton = document.getElementById("settings-button");
  const moreButton = document.getElementById("more-button");
  if (settingsButton) settingsButton.classList.toggle("visible");
}

function toggleSidebar() {
  const settingsButton = document.getElementById("settings-button");
  const moreButton = document.getElementById("more-button");
  
  // Handle mobile vs desktop display correctly
  if (window.innerWidth < 600) {
    const chatOverlay = document.getElementById("chat-overlay");
    if (chatOverlay) chatOverlay.style.display = chatOverlay.style.display === "none" ? "block" : "none";
    document.querySelector(".sidebar").style.display = "none"; // Hide desktop sidebar on mobile
  } else {
    const sidebarContent = document.getElementById("sidebar-content");
    const chatButtonsContainer = document.getElementById("chat-buttons-container");
    if (sidebarContent && chatButtonsContainer) {
      const isVisible = sidebarContent.style.display !== "none" || chatButtonsContainer.style.display !== "none";
      sidebarContent.style.display = isVisible ? "none" : "flex";
      chatButtonsContainer.style.display = isVisible ? "none" : "flex";
    }
  }
}

function forceFocusSearchInput(retries = 5) {
  const searchInput = document.querySelector(".search-input");
  if (searchInput) {
    searchInput.removeAttribute("inputmode");
    searchInput.focus();
  } else if (retries > 0) {
    setTimeout(() => forceFocusSearchInput(retries - 1), 50);
  }
}

function showMobileSearch() {
  const isEmptyChat = window.currentTweets ? window.currentTweets.length === 0 : true;
  if (!isEmptyChat && window.createNewChat) {
    window.createNewChat();
    setTimeout(() => forceFocusSearchInput(), 300);
  } else {
    setTimeout(() => forceFocusSearchInput(), 500);
  }
  const searchContainer = document.querySelector(".fixed-search-container");
  const mobileBottomNav = document.querySelector(".mobile-bottom-nav");
  if (searchContainer) searchContainer.classList.add("active");
  if (mobileBottomNav) mobileBottomNav.classList.add("hidden");
}

function hideMobileSearch() {
  const searchContainer = document.querySelector(".fixed-search-container");
  const mobileBottomNav = document.querySelector(".mobile-bottom-nav");
  if (searchContainer) searchContainer.classList.remove("active");
  if (mobileBottomNav) mobileBottomNav.classList.remove("hidden");
}

function updateMobileChatName(chatId) {
  const mobileChatName = document.getElementById("mobile-chat-name");
  if (mobileChatName) {
    mobileChatName.innerText = chatId ? `Chat ${chatId}` : "";
  }
}

/* –––––– Mobile Chat Overlay and Swipe Handling –––––– */
(function () {
  var chatOverlay = document.getElementById("chat-overlay");

  function showChatOverlay() {
    if (window.innerWidth > 599) return;
    var chatButtonsContainer = document.getElementById("chat-buttons-container");
    var overlayButtons = document.getElementById("chat-overlay-buttons");
    if (chatButtonsContainer && overlayButtons) {
      overlayButtons.innerHTML = "";
      var buttons = chatButtonsContainer.getElementsByTagName("button");
      for (var i = 0; i < buttons.length; i++) {
        (function (originalButton) {
          var chatId =
            originalButton.getAttribute("data-chat-id") ||
            ((originalButton.innerText.match(/Chat\s+(\d+)/) || [])[1]);
          if (!chatId) return;
          var newButton = originalButton.cloneNode(true);
          newButton.onclick = function (e) {
            hideChatOverlay();
            window.switchChat(parseInt(chatId, 10));
          };
          overlayButtons.appendChild(newButton);
        })(buttons[i]);
      }
    }
    if (chatOverlay) {
      // Add "Mehr" button and popup container if they don't exist
      if (!document.getElementById("mehr-button")) {
        const mehrButton = document.createElement("button");
        mehrButton.id = "mehr-button";
        mehrButton.className = "chat-button";
        mehrButton.style.position = "sticky";
        mehrButton.style.bottom = "0px";
        mehrButton.style.marginTop = "auto";
        mehrButton.style.backgroundColor = "white";
        mehrButton.style.paddingTop = "10px";
        mehrButton.style.paddingBottom = "10px";
        mehrButton.style.width = "100%";
        mehrButton.style.display = "flex";
        mehrButton.style.alignItems = "center";
        mehrButton.style.justifyContent = "space-between";
        
        // Create SVG icon for "more"
        const moreIcon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        moreIcon.classList.add("sidebar-icon", "icon-more");
        moreIcon.style.marginRight = "10px";
        moreIcon.style.marginLeft = "0";
        
        // Create use element to reference the icon
        const useElement = document.createElementNS("http://www.w3.org/2000/svg", "use");
        useElement.setAttributeNS("http://www.w3.org/1999/xlink", "xlink:href", "src/public/styles/icons.svg#icon-more");
        
        moreIcon.appendChild(useElement);
        
        // Add text and icon to button
        mehrButton.innerText = "Mehr";
        mehrButton.appendChild(moreIcon);
        
        const mehrPopup = document.createElement("div");
        mehrPopup.id = "mehr-popup";
        
        // Position the mehr button correctly - outside the chat-overlay-inner
        mehrButton.style.position = "sticky";
        mehrButton.style.bottom = "0px";
        mehrButton.style.marginTop = "auto";
        mehrButton.style.backgroundColor = "white";
        mehrButton.style.paddingTop = "10px";
        mehrButton.style.paddingBottom = "10px";
        mehrButton.style.paddingLeft = "20px";
        mehrButton.style.paddingRight = "10px";
        mehrButton.style.width = "100%";
        mehrButton.style.display = "flex";
        mehrButton.style.alignItems = "center";
        mehrButton.style.justifyContent = "space-between";
        
        // Make chat-overlay-inner a flex container with column direction and full height
        const chatOverlayInner = document.getElementById("chat-overlay-inner");
        chatOverlayInner.style.display = "flex";
        chatOverlayInner.style.flexDirection = "column";
        chatOverlayInner.style.height = "100%";
        
        // Add the button directly to chat-overlay instead of to the inner container
        chatOverlay.appendChild(mehrButton);
        
        mehrPopup.style.display = "none";
        mehrPopup.style.position = "fixed";
        mehrPopup.style.bottom = "60px";
        mehrPopup.style.left = "15px";
        mehrPopup.style.backgroundColor = "white";
        mehrPopup.style.boxShadow = "0 2px 10px rgba(0,0,0,0.1)";
        mehrPopup.style.borderRadius = "8px";
        mehrPopup.style.padding = "10px";
        mehrPopup.innerHTML = `
          <div style="position:absolute;top:5px;right:5px;cursor:pointer;font-size:16px;" onclick="document.getElementById('mehr-popup').style.display='none'">✕</div>
          <div><a href="/impressum" style="text-decoration:none;color:black;display:block;padding:8px;">Impressum</a></div>
          <div><a href="/datenschutz" style="text-decoration:none;color:black;display:block;padding:8px;">Datenschutz</a></div>
        `;
        
        mehrButton.onclick = function(e) {
          e.stopPropagation();
          mehrPopup.style.display = mehrPopup.style.display === "none" ? "block" : "none";
        };
        
        document.addEventListener("click", function(e) {
          if (mehrPopup.style.display === "block" && e.target !== mehrButton && !mehrPopup.contains(e.target)) {
            mehrPopup.style.display = "none";
          }
        });
        
        chatOverlay.appendChild(mehrPopup);
      }
      chatOverlay.style.display = "block";
    }
  }

  function hideChatOverlay() {
    if (chatOverlay) chatOverlay.style.display = "none";
  }

  var hamburgerMenu = document.querySelector(".hamburger-menu");
  if (hamburgerMenu) {
    hamburgerMenu.addEventListener("click", function () {
      if (window.innerWidth <= 599) {
        if (
          !chatOverlay ||
          chatOverlay.style.display === "none" ||
          chatOverlay.style.display === ""
        ) {
          showChatOverlay();
        } else {
          hideChatOverlay();
        }
      }
    });
  }

  var touchstartX = 0,
    touchendX = 0,
    touchstartY = 0,
    touchendY = 0;
  function handleGesture() {
    if (window.innerWidth > 599) return;
    var horizontalDiff = touchendX - touchstartX;
    var verticalDiff = Math.abs(touchendY - touchstartY);
    if (horizontalDiff > 20 && verticalDiff < horizontalDiff * 0.4) {
      showChatOverlay();
    } else if (
      touchstartX - touchendX > 20 &&
      verticalDiff < (touchstartX - touchendX) * 0.4
    ) {
      hideChatOverlay();
    }
  }
  document.addEventListener(
    "touchstart",
    function (event) {
      touchstartX = event.changedTouches[0].screenX;
      touchstartY = event.changedTouches[0].screenY;
    },
    false
  );
  document.addEventListener(
    "touchend",
    function (event) {
      touchendX = event.changedTouches[0].screenX;
      touchendY = event.changedTouches[0].screenY;
      handleGesture();
    },
    false
  );
})();

if (window.innerWidth <= 600) {
  let touchStartY = null;
  document.addEventListener(
    "touchstart",
    function (e) {
      touchStartY = e.touches[0].clientY;
    },
    { passive: true }
  );
  document.addEventListener(
    "touchmove",
    function (e) {
      if (touchStartY !== null) {
        const currentTouchY = e.touches[0].clientY;
        if (Math.abs(currentTouchY - touchStartY) > 3) {
          const activeEl = document.activeElement;
          if (
            activeEl &&
            (activeEl.tagName === "INPUT" ||
              activeEl.tagName === "TEXTAREA" ||
              activeEl.classList.contains("search-input"))
          ) {
            activeEl.blur();
          }
        }
      }
    },
    { passive: true }
  );
  document.addEventListener(
    "touchend",
    function () {
      touchStartY = null;
    },
    { passive: true }
  );
}

document.addEventListener("DOMContentLoaded", function () {
  updateUserInfo();
  displayCookies();
  if (typeof fetchUserIPAddresses === "function") {
    fetchUserIPAddresses()
      .then(({ userIpV4, userIpV6 }) => {
        fetch(`https://goldpluto.com/api/app/chatids?ipv6=${userIpV6}`)
          .then(response => response.json())
          .then(chatData => {
            if (window.location.pathname !== "/") {
              chatData.shift();
            }
            const chatButtonsContainer = document.getElementById("chat-buttons-container");
            chatData.forEach(chat => {
              const chatId = chat.ChatID;
              const newButton = document.createElement("button");
              newButton.innerText = `Chat ${chatId}`;
              newButton.className = "chat-button";
              newButton.setAttribute("data-chat-id", chatId);
              newButton.onclick = () => {
                if (typeof window.switchChat === "function") {
                  window.switchChat(chatId);
                }
              };
              if (chatButtonsContainer) chatButtonsContainer.appendChild(newButton);
            });
          })
          .catch(error => console.error("Error fetching chat IDs:", error));
      })
      .catch(error => console.error("Error fetching IP addresses:", error));
  }
});

window.toggleUserInfo = toggleUserInfo;
window.logout = logout;
window.toggleSettings = toggleSettings;
window.toggleSidebar = toggleSidebar;
window.forceFocusSearchInput = forceFocusSearchInput;
window.showMobileSearch = showMobileSearch;
window.hideMobileSearch = hideMobileSearch;
window.updateMobileChatName = updateMobileChatName;

window.switchChatProfile = function () {
  console.log("switchChatProfile not implemented.");
};
window.switchChatNotifications = function () {
  console.log("switchChatNotifications not implemented.");
};

function switchChat(chatId) {
  fetch(`https://goldpluto.com/api/app/requestposts?chat_id=${chatId}`, {
    credentials: "include"
  })
    .then(response => response.json())
    .then(data => {
      // Only update URL if we have posts and a ChatURL
      if (data.posts && data.posts.length > 0 && data.posts[0].ChatURL) {
        // Don't use pushState if we're already on this URL
        const currentPath = window.location.pathname.substring(1); // Remove leading slash
        if (currentPath !== data.posts[0].ChatURL) {
          window.history.pushState({}, '', `/${data.posts[0].ChatURL}`);
        }
      }
    })
    .catch(error => {
      console.error('Error:', error);
    });
} 