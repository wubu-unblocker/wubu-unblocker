import fs from 'fs';

// 1. Fix docs.html layout
let docsPath = 'views/pages/nav/docs.html';
if (fs.existsSync(docsPath)) {
    let text = fs.readFileSync(docsPath, 'utf8');
    // Reduce roundness and make it wider
    text = text.replace(/grid-template-columns: 280px 1fr;/g, 'grid-template-columns: 240px 1fr; gap: 40px;');
    // Remove central confinement
    text = text.replace(/--radius-lg/g, '--radius-sm');
    text = text.replace(/padding: 18px;/g, 'padding: 32px; border: none; box-shadow: none; background: transparent;');

    // Make the content feel more spread out and less confined
    text = text.replace(/<main class="container">/g, '<main class="container" style="max-width: 1200px; padding: 0 40px;">');

    fs.writeFileSync(docsPath, text, 'utf8');
}

// 2. Fix issues.html file input styling
let issuesPath = 'views/pages/nav/issues.html';
if (fs.existsSync(issuesPath)) {
    let text = fs.readFileSync(issuesPath, 'utf8');

    // Add file input styling CSS
    const cssToAdd = `
      input[type="file"] {
        padding: 10px;
        background: var(--surface);
        border: 2px dashed var(--border);
        border-radius: 12px;
        color: var(--text-main);
        cursor: pointer;
        width: 100%;
        transition: all 0.2s;
      }
      input[type="file"]::file-selector-button {
        background: var(--accent);
        color: white;
        border: none;
        padding: 8px 16px;
        border-radius: 8px;
        margin-right: 16px;
        font-weight: 600;
        cursor: pointer;
        transition: background 0.2s;
      }
      input[type="file"]::file-selector-button:hover {
        background: var(--accent-hover);
      }
      input[type="file"]:hover {
        border-color: var(--accent);
      }
`;
    // Insert into style tag
    text = text.replace('</style>', cssToAdd + '\n    </style>');

    fs.writeFileSync(issuesPath, text, 'utf8');
}

console.log('Fixed docs and issues styling.');
