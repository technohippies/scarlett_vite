// Helper function to inspect messages
export const inspectMessage = (message: any, context: string = 'Message') => {
  try {
    // Skip detailed inspection if message is a Uint8Array or similar
    if (message instanceof Uint8Array || 
        (message && typeof message === 'object' && message.constructor && message.constructor.name === 'Uint8Array')) {
      console.log(`🔍 ${context} is a Uint8Array of length ${message.length}`);
      return;
    }
    
    // Extract basic info that's actually useful
    const basicInfo = {
      id: message.id,
      senderAddress: message.senderAddress,
      senderInboxId: message.senderInboxId,
      recipientAddress: message.recipientAddress,
      sent: message.sent,
      contentType: message.content ? (typeof message.content === 'object' ? 'object' : typeof message.content) : 'undefined'
    };
    
    console.log(`🔍 ${context}`);
    console.log(`Basic Info:`, basicInfo);
    
    // Only log content if it's a string and not too long
    if (message.content && typeof message.content === 'string' && message.content.length < 500) {
      console.log(`Content: ${message.content}`);
    } else if (message.content && typeof message.content === 'object') {
      // For objects, just log the type and keys
      console.log(`Content type: ${message.content.constructor ? message.content.constructor.name : 'object'}`);
      console.log(`Content keys: ${Object.keys(message.content).join(', ')}`);
    }
    
    // Skip the verbose property enumeration and prototype chain
  } catch (error) {
    console.error('Error inspecting message:', error);
  }
};

// Helper function to inspect conversations
export const inspectConversation = (conversation: any, context: string = 'Conversation') => {
  try {
    // Extract basic info that's actually useful
    const basicInfo = {
      id: conversation.id,
      topic: conversation.topic,
      peerAddress: conversation.peerAddress,
      peerInboxId: conversation.peerInboxId,
      createdAt: conversation.createdAt
    };
    
    console.log(`🔍 ${context}`);
    console.log(`Basic Info:`, basicInfo);
    
    // Skip the verbose property enumeration and prototype chain
  } catch (error) {
    console.error('Error inspecting conversation:', error);
  }
};

// Helper function to inspect clients
export const inspectClient = (client: any, context: string = 'Client') => {
  try {
    // Extract basic info that's actually useful
    const basicInfo = {
      address: client.address,
      inboxId: client.inboxId,
      env: client.env
    };
    
    console.log(`🔍 ${context}`);
    console.log(`Basic Info:`, basicInfo);
    
    // Skip the verbose property enumeration and prototype chain
  } catch (error) {
    console.error('Error inspecting client:', error);
  }
}; 