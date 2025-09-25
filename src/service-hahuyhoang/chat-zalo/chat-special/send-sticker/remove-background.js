export async function removeBackground(imageUrl) {
    try {
        const response = await axios.get(
          `https://hungdev.id.vn/ai/rpb?apikey=0c590fbeeb556d3cd29f419181c4a2&url=${encodeURIComponent(
            imageUrl
          )}`
        );
    
        if (
          !response.data ||
          !response.data.data.startsWith("data:image/png;base64,")
        )
          return null;
    
        const base64Data = response.data.data.replace(
          /^data:image\/png;base64,/,
          ""
        );
        return Buffer.from(base64Data, "base64");
      } catch (error) {
        console.error("Lỗi khi xóa phông:", error);
        return null;
      }
    }