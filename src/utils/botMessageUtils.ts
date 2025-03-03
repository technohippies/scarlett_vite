/**
 * Bot Message Detection Utilities
 * Contains functions for determining if a message is from a bot in XMTP
 */

// Known bot inbox IDs - add any known bot addresses here
export const KNOWN_BOT_INBOX_IDS = [
  '67e948e03dfd2842b5302872f49734e338a21b0db60816ab56bd16fad40dfe16'
];

/**
 * Determines if a message is from a bot based on multiple indicators
 * @param message - The XMTP message to check
 * @param ourWalletAddress - The user's wallet address or inbox ID for comparison
 * @param botInboxId - Optional known bot inbox ID
 * @returns boolean - True if the message is determined to be from a bot
 */
export const isBotMessage = (message: any, ourWalletAddress?: string | null, botInboxId?: string | null): boolean => {
  try {
    // ----- Check explicit flags ----- 
    // 1. Check if the message has explicit bot flag
    if (message.isBot === true) {
      return true;
    }
    
    // 2. If the message has a direction, use that
    if (message.direction === 'received') {
      return true;
    }
    
    // 3. If the message has a sender field, use that
    if (message.sender === 'bot') {
      return true;
    }
    
    // ----- Check against known bot IDs ----- 
    // 4. Direct check against known bot inbox IDs
    if (message.senderInboxId && KNOWN_BOT_INBOX_IDS.includes(message.senderInboxId)) {
      console.log(`Identified bot message by known inbox ID: ${message.senderInboxId}`);
      return true;
    }
    
    // 5. Check against provided botInboxId if available
    if (botInboxId && message.senderInboxId && message.senderInboxId === botInboxId) {
      return true;
    }
    
    // 6. Check against provided botInboxId with sender address
    if (botInboxId && message.senderAddress && 
        message.senderAddress.toLowerCase() === botInboxId.toLowerCase()) {
      return true;
    }
    
    // ----- Check against user's own address ----- 
    // 7. If we have the sender address and user address, check if they're different
    if (message.senderAddress && ourWalletAddress) {
      // Safer comparison that handles string or null
      const senderAddr = String(message.senderAddress).toLowerCase();
      const userAddr = String(ourWalletAddress).toLowerCase();
      
      // If sender is not the user, it's likely a bot
      if (senderAddr !== userAddr) {
        return true;
      }
    }
    
    // 8. Additional checks for inbox ID if available
    if (message.senderInboxId && message.ourInboxId && 
        message.senderInboxId !== message.ourInboxId) {
      return true;
    }
    
    // ----- Content-based heuristics ----- 
    // 9. Check if this looks like an auto-response message
    if (typeof message.content === 'string') {
      const content = message.content.trim();
      // Some heuristics for detecting bot responses
      if (
        // Starts with greeting patterns
        content.match(/^(hi|hello|hey|greetings|howdy)/i) ||
        // Contains typical bot disclaimer patterns
        content.includes("I'm an AI") ||
        content.includes("I am an AI") ||
        content.includes("As an AI")
      ) {
        return true;
      }
    }
    
    // Default to false if we can't determine
    return false;
  } catch (error) {
    console.warn('Error in isBotMessage:', error);
    return false;
  }
};

/**
 * Logs detailed information about message direction determination
 * @param message - The message being checked
 * @param isFromBot - The result of the bot detection
 * @param ourWalletAddress - The user's wallet address
 * @param botInboxId - The bot's inbox ID if available
 */
export const logMessageDirectionInfo = (
  message: any, 
  isFromBot: boolean,
  ourWalletAddress?: string | null,
  botInboxId?: string | null
) => {
  console.log('Message direction determination:', {
    id: message.id,
    senderInboxId: message.senderInboxId,
    senderAddress: message.senderAddress,
    botInboxId: botInboxId,
    ourWalletAddress: ourWalletAddress,
    knownBotCheck: message.senderInboxId && KNOWN_BOT_INBOX_IDS.includes(message.senderInboxId),
    explicitFlags: {
      isBot: message.isBot === true,
      direction: message.direction === 'received',
      sender: message.sender === 'bot'
    },
    addressCheck: (ourWalletAddress && message.senderAddress && 
                  message.senderAddress.toLowerCase() !== ourWalletAddress.toLowerCase()),
    botInboxCheck: (botInboxId && message.senderAddress && 
                  (message.senderAddress.toLowerCase() === botInboxId.toLowerCase())),
    senderInboxCheck: (botInboxId && message.senderInboxId && message.senderInboxId === botInboxId),
    finalDecision: isFromBot
  });
}; 