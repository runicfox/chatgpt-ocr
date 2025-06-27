# chatgpt-ocr
Obsidian Plugin to leverage ChatGPT to extract text from handwriting and return as Markdown.

## Prioritize precision with no summarization or interpretation.
The default prompt will extract the text as close to verbatim as much as it is able. If the model is not confident in its interpretation of the handwriting, it is instructed to surround the suspect text with italics, to help provide immediate visibility on areas of possible user-correction.

## Properties
The default prompt is instructed to include YAML properties at the top of the note, and includes possible tags to be included. Your mileage here will vary. Future iteration may include the ability for the model to consider existing tags in the vault when determining valid options. When the prompt encounters the names of people, it may include those names using the `with` property. Your mileage here may also vary, and this feature is a subject of possible future enhancement.

