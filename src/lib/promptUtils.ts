import { generateChatCompletion } from './openrouter-client';
import { getGlobalConfig } from './storage';

/**
 * Generates example prompts based on the agent's configuration using the LLM API
 * @param name Agent name
 * @param systemPrompt Agent system prompt
 * @param provider API provider (openai or openrouter)
 * @param modelName Model name to use
 * @returns Array of example prompts
 */
export async function generateExamplePrompts(
  name: string,
  systemPrompt: string,
  provider: 'openrouter' | 'openai'
): Promise<string[]> {
  // Default prompts in case API call fails
  const defaultPrompts = [
    `What can you help me with as ${name}?`,
    "Explain a complex concept in simple terms",
    "Give me some creative ideas",
    "How would you solve this problem?"
  ];
  
  try {
    // Get API key from global config
    const config = getGlobalConfig();
    const apiKey = provider === 'openrouter' ? config.openrouterApiKey : config.openaiApiKey;
    
    // If no API key is available, return default prompts
    if (!apiKey) {
      console.warn('No API key available for generating example prompts');
      return defaultPrompts;
    }
    
    // Create a prompt to ask the LLM to generate example prompts
    const promptGenerationMessage = `
You are helping to create 4 example prompts that users can click on to start a conversation with an AI assistant.
The assistant has the following name: "${name}"
The assistant has the following system prompt: "${systemPrompt}"

Generate 4 diverse, interesting example prompts that would showcase the assistant's capabilities based on its system prompt.
Each prompt should be a question or request that a user might ask this specific assistant.
Keep each prompt under 100 characters if possible.
Return ONLY the 4 prompts as a JSON array of strings, with no additional text or explanation.
Example format: ["Prompt 1", "Prompt 2", "Prompt 3", "Prompt 4"]
`;

    // Call the API to generate example prompts
    const response = await generateChatCompletion({
      messages: [
        { role: 'system', content: 'You are a helpful assistant that generates example prompts.' },
        { role: 'user', content: promptGenerationMessage }
      ],
      model: provider === 'openrouter' ? "openai/gpt-4o-mini" : "gpt-4o-mini",
      apiKey,
      provider,
    });
    
    // Parse the response to extract the prompts
    try {
      // Try to parse as JSON first
      const promptsArray = JSON.parse(response.content);
      if (Array.isArray(promptsArray) && promptsArray.length > 0) {
        // Ensure we have exactly 4 prompts
        const validPrompts = promptsArray
          .filter(p => typeof p === 'string' && p.trim().length > 0)
          .slice(0, 4);
          
        // If we have at least one valid prompt, return them (pad with defaults if needed)
        if (validPrompts.length > 0) {
          while (validPrompts.length < 4) {
            validPrompts.push(defaultPrompts[validPrompts.length]);
          }
          return validPrompts;
        }
      }
      
      // If JSON parsing succeeded but didn't give us valid prompts, fall back to text parsing
      throw new Error('Invalid JSON format');
    } catch {
      // If JSON parsing fails, try to extract prompts from the text
      const lines = response.content
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0 && !line.startsWith('[') && !line.startsWith(']') && !line.startsWith('{') && !line.startsWith('}'));
      
      // Extract potential prompts (lines that look like list items or quoted strings)
      const extractedPrompts = lines
        .map(line => {
          // Remove list markers, quotes, etc.
          return line
            .replace(/^[0-9]+[\.\)]\s*/, '') // Remove numbered list markers
            .replace(/^[-*•]\s*/, '')        // Remove bullet list markers
            .replace(/^["']|["']$/g, '')     // Remove surrounding quotes
            .trim();
        })
        .filter(line => line.length > 0)
        .slice(0, 4);
      
      if (extractedPrompts.length > 0) {
        // Pad with defaults if needed
        while (extractedPrompts.length < 4) {
          extractedPrompts.push(defaultPrompts[extractedPrompts.length]);
        }
        return extractedPrompts;
      }
    }
    
    // If all parsing attempts fail, return default prompts
    return defaultPrompts;
  } catch (error) {
    console.error('Error generating example prompts:', error);
    return defaultPrompts;
  }
}

/**
 * Extract potential topics from a system prompt
 */
function extractTopics(systemPrompt: string): string[] {
  // Simple extraction based on common patterns in system prompts
  const topics: string[] = [];
  
  // Look for expertise mentions
  const expertiseMatch = systemPrompt.match(/expert in ([\w\s,]+)/i);
  if (expertiseMatch && expertiseMatch[1]) {
    topics.push(...expertiseMatch[1].split(/,|\sand\s/).map(t => t.trim()));
  }
  
  // Look for specialized in mentions
  const specializedMatch = systemPrompt.match(/specialized in ([\w\s,]+)/i);
  if (specializedMatch && specializedMatch[1]) {
    topics.push(...specializedMatch[1].split(/,|\sand\s/).map(t => t.trim()));
  }
  
  // Look for "you are a" mentions
  const roleMatch = systemPrompt.match(/you are an? ([\w\s]+)/i);
  if (roleMatch && roleMatch[1]) {
    topics.push(roleMatch[1].trim());
  }
  
  // If no topics found, extract nouns as potential topics
  if (topics.length === 0) {
    const words = systemPrompt.split(/\s+/);
    const potentialTopics = words.filter(word => 
      word.length > 4 && 
      !['about', 'should', 'would', 'could', 'their', 'there', 'these', 'those', 'other'].includes(word.toLowerCase())
    );
    
    // Take a few random words as topics
    if (potentialTopics.length > 0) {
      const randomTopics = potentialTopics
        .sort(() => 0.5 - Math.random())
        .slice(0, 3)
        .map(t => t.replace(/[.,;:!?]$/, ''));
      
      topics.push(...randomTopics);
    }
  }
  
  return [...new Set(topics)]; // Remove duplicates
}

/**
 * Create a prompt for a specific topic - used as fallback
 */
function createPromptForTopic(topic: string): string {
  const promptTemplates = [
    `Can you explain ${topic} in simple terms?`,
    `What are the best practices for ${topic}?`,
    `How can I learn more about ${topic}?`,
    `What's new in ${topic}?`,
    `Give me a quick overview of ${topic}`,
    `What should I know about ${topic}?`
  ];
  
  const randomIndex = Math.floor(Math.random() * promptTemplates.length);
  return promptTemplates[randomIndex];
}

/**
 * Get a generic prompt based on the provider - used as fallback
 */
function getGenericPrompt(provider: 'openrouter' | 'openai', index: number): string {
  const openaiPrompts = [
    "Write a short story about a robot learning to love",
    "Explain quantum computing in simple terms",
    "What are some creative ways to solve everyday problems?",
    "How can AI help improve education?",
    "What might the world look like in 50 years?"
  ];
  
  const openrouterPrompts = [
    "Create a detailed scene for a fantasy novel",
    "Design a unique character for a sci-fi story",
    "What are some unconventional approaches to problem-solving?",
    "How might different AI models approach the same problem?",
    "Describe a day in the life of someone living in the year 2100"
  ];
  
  const prompts = provider === 'openai' ? openaiPrompts : openrouterPrompts;
  return prompts[index % prompts.length];
}

/**
 * Synchronous version of generateExamplePrompts that uses pattern matching
 * This is used as a fallback when API calls are not possible
 */
export function generateExamplePromptsSync(
  name: string,
  systemPrompt: string,
  provider: 'openrouter' | 'openai'
): string[] {
  // Extract key topics from the system prompt
  const topics = extractTopics(systemPrompt);
  
  // Generate prompts based on agent name, system prompt topics, and provider
  const prompts: string[] = [];
  
  // Add a prompt based on the agent's name
  prompts.push(`What can you help me with as ${name}?`);
  
  // Add prompts based on extracted topics
  if (topics.length > 0) {
    // Take up to 3 topics to create specific prompts
    topics.slice(0, 3).forEach(topic => {
      prompts.push(createPromptForTopic(topic));
    });
  }
  
  // If we don't have enough prompts yet, add some generic ones based on provider
  while (prompts.length < 4) {
    prompts.push(getGenericPrompt(provider, prompts.length));
  }
  
  return prompts;
}

/**
 * Generates a title for a chat session based on the first user message
 * @param userMessage The first user message in the chat
 * @param provider API provider (openai or openrouter)
 * @param apiKey API key for the provider
 * @returns Generated title for the chat session
 */
export async function generateChatTitle(
  userMessage: string,
  provider: 'openrouter' | 'openai',
  apiKey: string
): Promise<string> {
  // Default title in case API call fails
  const defaultTitle = `Chat ${new Date().toLocaleString()}`;
  
  try {
    // If no API key is available, return default title
    if (!apiKey) {
      console.warn('No API key available for generating chat title');
      return defaultTitle;
    }
    
    // Create a prompt to ask the LLM to generate a title
    const titleGenerationMessage = `
Generate a short, descriptive title (maximum 6 words) for a chat conversation that starts with this user message:

"${userMessage}"

The title should be concise, relevant to the topic, and help the user identify the conversation later.
Return ONLY the title text with no quotes, explanations, or additional formatting.
`;

    // Call the API to generate a title using GPT-4o
    const response = await generateChatCompletion({
      messages: [
        { role: 'system', content: 'You are a helpful assistant that generates concise, descriptive titles.' },
        { role: 'user', content: titleGenerationMessage }
      ],
      // Always use gpt-4o for title generation, regardless of the agent's model
      model: provider === 'openrouter' ? "openai/gpt-4o" : "gpt-4o",
      apiKey,
      provider,
    });
    
    // Clean up the response
    const title = response.content
      .trim()
      .replace(/^["']|["']$/g, '') // Remove surrounding quotes if present
      .replace(/\.$/, '');         // Remove trailing period if present
    
    // If we got a valid title, return it
    if (title && title.length > 0) {
      return title;
    }
    
    // Fallback to default title if response was empty
    return defaultTitle;
  } catch (error) {
    console.error('Error generating chat title:', error);
    return defaultTitle;
  }
} 