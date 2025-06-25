/**
 * Obsidian Plugin: Image to Markdown via Scriber (Compiled JavaScript Version)
 */

const { PluginSettingTab, Plugin, TFile, Notice, moment, Setting } = require('obsidian');

const DEFAULT_SETTINGS = {
  apiKey: '',
  processedImages: {}
};

module.exports = class ImageToMarkdownPlugin extends Plugin {
  async onload() {
    const self = this;
    console.log('Loading ChatGPT-OCR Plugin');
    await this.loadSettings();
    this.addSettingTab(new ImageToMarkdownSettingTab(this.app, this));

    this.addRibbonIcon('image-file', 'Process Image with Scriber', async () => {
      const activeView = this.app.workspace.getActiveViewOfType(require('obsidian').MarkdownView);
      const file = activeView?.file;
      if (!file || !(file instanceof TFile)) {
        new Notice('No active note to process.');
        return;
      }

      let content = await this.app.vault.read(file);
      const imageLinks = this.extractNewImageLinks(content);

      if (imageLinks.length === 0) {
        new Notice('No images found to process.');
        return;
      }

      console.log('[Scriber] Manually triggered. Found image links:', imageLinks);

      const combinedBodies = [];
      let yamlBlock = null;
      const allTags = [];

      for (const link of imageLinks) {
        const imagePath = link.match(/\[\[(.*?)\]\]/)?.[1];
        if (!imagePath) continue;

        let imageFile = this.app.vault.getAbstractFileByPath(imagePath);

        // If not found, try looking in the Attachments folder
        if (!(imageFile instanceof TFile)) {
          const attachmentPath = `Attachments/${imagePath}`;
          imageFile = this.app.vault.getAbstractFileByPath(attachmentPath);
        }

        if (imageFile instanceof TFile) {
          const extension = imageFile.extension.toLowerCase();
          if (!['png', 'jpg', 'jpeg'].includes(extension)) continue;

          const arrayBuffer = await this.app.vault.readBinary(imageFile);
          const base64Image = this.arrayBufferToBase64(arrayBuffer);

          console.log('[Scriber] Sending image to ChatGPT:', imagePath);
          const markdown = await this.sendToScriber(base64Image, extension);
          console.log('[Scriber] Response from ChatGPT:', markdown);

          if (markdown) {
            const clean = markdown.replace(/^```markdown\n?|```$/gm, '').trim();
            const match = clean.match(/^---\n[\s\S]+?\n---/);
            if (match) {
              const yaml = match[0];
              let body = clean.replace(yaml, '').trim();

              // Look for markdown-style tag line like "**Tags:** AI, Obsidian"
              const tagLineMatch = body.match(/\*\*Tags:\*\*\s*(.+)/i);
              if (tagLineMatch) {
                const tags = tagLineMatch[1].split(',').map(t => t.trim()).filter(Boolean);
                allTags.push(...tags);
                // Remove the tag line from the body
                body = body.replace(tagLineMatch[0], '').trim();
              }


              if (!yamlBlock) {
                yamlBlock = yaml.replace(/tags:\s*\[.*?\]\s*/gi, '').trim();
              }

              // Remove any leftover YAML front matter blocks from body
              body = body.replace(/^---\n[\s\S]+?\n---/, '').trim();

              combinedBodies.push(body);
            } else {
              combinedBodies.push(clean);
            }
          }

        }
      }

      if (combinedBodies.length > 0) {
        const uniqueTags = [...new Set(allTags)];
        const tagLine = uniqueTags.length ? `tags: [${uniqueTags.map(tag => `"${tag}"`).join(', ')}]` : '';

        let finalYaml = '';
        if (yamlBlock) {
          let lines = yamlBlock.split('\n');

          // Ensure the block ends with '---'
          if (lines[lines.length - 1].trim() !== '---') {
            lines.push('---');
          }

          // Remove any existing 'tags:' lines
          lines = lines.filter(line => !line.trim().startsWith('tags:'));

          // Insert tags before final '---'
          const endIndex = lines.lastIndexOf('---');
          if (tagLine && endIndex !== -1) {
            lines.splice(endIndex, 0, tagLine);
          }

          finalYaml = lines.join('\n');
        } else if (tagLine) {
          finalYaml = `---\n${tagLine}\n---`;
        }

        const finalMarkdown = `${finalYaml}\n\n${combinedBodies.join('\n\n')}`;
        const firstLink = imageLinks[0];

        content = content.replace(firstLink, `${finalMarkdown}

${firstLink}`);
        await this.app.vault.modify(file, content);
        new Notice(`Scriber processed ${combinedBodies.length} image(s).`);
      } else {
        new Notice('No Markdown extracted from images.');
      }
    });
  }

  async logActivity(message) {
    const now = moment().format('YYYY-MM-DD HH:mm:ss');
    const logNotePath = 'Scriber Log.md';
    const entry = `\n[${now}] ${message}`;

    const file = this.app.vault.getAbstractFileByPath(logNotePath);
    if (file instanceof TFile) {
      const current = await this.app.vault.read(file);
      await this.app.vault.modify(file, current + entry);
    } else {
      await this.app.vault.create(logNotePath, `# Scriber Activity Log\n${entry}`);
    }
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
  extractNewImageLinks(content) {
    const regex = /!\[\[[^\]]+\.(png|jpg|jpeg)\]\]/gi;
    return content.match(regex) || [];
  }

  arrayBufferToBase64(buffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }


  async sendToScriber(base64Image, extension) {
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.settings.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages: [
            {
              role: 'system',
              content: 'Your name is Scriber.  You are an expert in transcribing meeting notes from handwriting into Markdown.  You prioritize precision and accuracy when transcribing handwriting and will not attempt to change the content of the extracted text. If you are not confident in your interpretation of the handwriting, you will add italics to the relevant text. You include YAML front-matter properties for each file, including a property for the Date (taken form the handwriting source). When you encounter "With:" near the top of a page, you will include a list property for the names listed in the image.  Finally, you will use the extracted text to suggest tags based on the meeting content. When interpreting text, here is a list of words that are terms that are specific to my notes: '
            },
            {
              role: 'user',
              content: [
                {
                  type: 'image_url',
                  image_url: {
                    url: `data:image/${extension};base64,${base64Image}`
                  }
                }
              ]
            }
          ]
        })
      });

      if (!response.ok) {
        new Notice('Failed to get response from Scriber.');
        return null;
      }

      const data = await response.json();
      return data.choices[0].message.content;
    } catch (e) {
      console.error(e);
      new Notice('Error communicating with Scriber.');
      return null;
    }
  }
};

class ImageToMarkdownSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl('h2', { text: 'Image to Markdown Settings' });

    new Setting(containerEl)
      .setName('OpenAI API Key')
      .setDesc('Your OpenAI API key to access ChatGPT (Scriber).')
      .addText(text =>
        text
          .setPlaceholder('sk-...')
          .setValue(this.plugin.settings.apiKey)
          .onChange(async (value) => {
            this.plugin.settings.apiKey = value;
            await this.plugin.saveSettings();
          })
      );
  }
}
