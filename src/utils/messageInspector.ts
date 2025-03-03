/**
 * Message Inspector Utility
 * 
 * This utility helps debug XMTP message structures by providing
 * detailed logging of message properties and conversation contexts.
 */

/**
 * Safely converts an object to a string, handling circular references
 */
const safeStringify = (obj: any, indent = 2): string => {
  const cache = new Set();
  return JSON.stringify(
    obj,
    (key, value) => {
      if (typeof value === 'object' && value !== null) {
        // Handle circular references
        if (cache.has(value)) {
          return '[Circular Reference]';
        }
        cache.add(value);
        
        // Handle functions
        if (typeof value === 'function') {
          return `[Function: ${value.name || 'anonymous'}]`;
        }
        
        // Handle promises
        if (value instanceof Promise) {
          return '[Promise]';
        }
      }
      return value;
    },
    indent
  );
};

/**
 * Logs the complete structure of an XMTP message
 */
export const inspectMessage = (message: any, label = 'Message Structure'): void => {
  try {
    // Extract basic properties for quick reference
    const basicInfo = {
      id: message.id,
      senderAddress: message.senderAddress,
      senderInboxId: message.senderInboxId,
      recipientAddress: message.recipientAddress,
      sent: message.sent,
      contentType: message.contentType?.toString?.(),
      contentTypeId: message.contentType?.id,
      hasContent: !!message.content,
      contentIsPromise: message.content instanceof Promise,
      direction: message.direction,
      isBot: message.isBot,
    };
    
    console.group(`🔍 ${label}`);
    console.log('Basic Info:', basicInfo);
    
    // Log all properties
    console.log('All Properties:');
    const allProps = Object.getOwnPropertyNames(message);
    allProps.forEach(prop => {
      try {
        const value = message[prop];
        const valueType = typeof value;
        
        if (valueType === 'function') {
          console.log(`  ${prop}: [Function]`);
        } else if (value instanceof Promise) {
          console.log(`  ${prop}: [Promise]`);
        } else if (valueType === 'object' && value !== null) {
          console.log(`  ${prop}: [Object]`, value);
        } else {
          console.log(`  ${prop}:`, value);
        }
      } catch (err) {
        console.log(`  ${prop}: [Error accessing property]`);
      }
    });
    
    // Log prototype chain
    let proto = Object.getPrototypeOf(message);
    if (proto && proto !== Object.prototype) {
      console.log('Prototype Chain:');
      let protoLevel = 1;
      while (proto && proto !== Object.prototype) {
        console.log(`  Level ${protoLevel}:`, Object.getOwnPropertyNames(proto));
        proto = Object.getPrototypeOf(proto);
        protoLevel++;
      }
    }
    
    console.groupEnd();
  } catch (error) {
    console.error('Error inspecting message:', error);
  }
};

/**
 * Logs the complete structure of an XMTP conversation
 */
export const inspectConversation = (conversation: any, label = 'Conversation Structure'): void => {
  try {
    // Extract basic properties for quick reference
    const basicInfo = {
      id: conversation.id,
      topic: conversation.topic,
      peerAddress: conversation.peerAddress,
      peerInboxId: conversation.peerInboxId,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
      isGroup: !!conversation.isGroup,
    };
    
    console.group(`🔍 ${label}`);
    console.log('Basic Info:', basicInfo);
    
    // Log all properties
    console.log('All Properties:');
    const allProps = Object.getOwnPropertyNames(conversation);
    allProps.forEach(prop => {
      try {
        const value = conversation[prop];
        const valueType = typeof value;
        
        if (valueType === 'function') {
          console.log(`  ${prop}: [Function]`);
        } else if (value instanceof Promise) {
          console.log(`  ${prop}: [Promise]`);
        } else if (valueType === 'object' && value !== null) {
          console.log(`  ${prop}: [Object]`, value);
        } else {
          console.log(`  ${prop}:`, value);
        }
      } catch (err) {
        console.log(`  ${prop}: [Error accessing property]`);
      }
    });
    
    // Log available methods
    console.log('Available Methods:');
    let proto = Object.getPrototypeOf(conversation);
    if (proto) {
      const methods = Object.getOwnPropertyNames(proto)
        .filter(name => typeof conversation[name] === 'function');
      methods.forEach(method => {
        console.log(`  ${method}`);
      });
    }
    
    console.groupEnd();
  } catch (error) {
    console.error('Error inspecting conversation:', error);
  }
};

/**
 * Logs the complete structure of the XMTP client
 */
export const inspectClient = (client: any, label = 'XMTP Client Structure'): void => {
  try {
    console.group(`🔍 ${label}`);
    
    // Log basic client info
    console.log('Client Info:');
    console.log('  address:', client.address);
    console.log('  inboxId:', client.inboxId);
    
    // Log available methods
    console.log('Available Methods:');
    const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(client))
      .filter(name => typeof client[name] === 'function');
    methods.forEach(method => {
      console.log(`  ${method}`);
    });
    
    // Log conversations API if available
    if (client.conversations) {
      console.log('Conversations API Methods:');
      const conversationMethods = Object.getOwnPropertyNames(Object.getPrototypeOf(client.conversations))
        .filter(name => typeof client.conversations[name] === 'function');
      conversationMethods.forEach(method => {
        console.log(`  ${method}`);
      });
    }
    
    console.groupEnd();
  } catch (error) {
    console.error('Error inspecting client:', error);
  }
}; 