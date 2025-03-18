export function ScrollDownButton() {
  const handleScrollDown = () => {
    window.scrollTo({
      top: document.documentElement.scrollHeight,
      behavior: "smooth",
    });
  };

  return React.createElement(
    "div",
    {
      className: "scroll-down-button",
      onClick: handleScrollDown,
      style: {
        position: "fixed",
        bottom: "90px",
        right: "20px",
        cursor: "pointer",
        backgroundColor: "white",
        border: "1px solid #ccc",
        borderRadius: "50%",
        width: "40px",
        height: "40px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1002,
      },
    },
    React.createElement(
      "svg",
      {
        width: "24",
        height: "24",
        viewBox: "0 0 24 24",
        fill: "none",
        xmlns: "http://www.w3.org/2000/svg",
      },
      React.createElement("path", {
        d: "M12 16L6 10H18L12 16Z",
        fill: "black",
      })
    )
  );
} 