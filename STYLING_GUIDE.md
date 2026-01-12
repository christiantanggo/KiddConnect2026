# Tavari Styling Guide

## Critical Rule: Text Color Must Always Be Visible

**NEVER use white text on white backgrounds. Always explicitly set text and background colors for all form inputs, selects, and textareas.**

## Standard Input Classes

### Text Inputs
```jsx
className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
```

### Number Inputs
```jsx
className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
```

### Textareas
```jsx
className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
```

### Select Dropdowns
```jsx
className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
```

## Required Classes for All Form Elements

**Every input, select, and textarea MUST include:**
- `text-gray-900` - Ensures text is always dark and visible
- `bg-white` - Ensures background is white (not transparent)

## Complete Input Template

```jsx
<input
  type="text"
  value={value}
  onChange={(e) => setValue(e.target.value)}
  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
/>
```

## Select Template

```jsx
<select
  value={value}
  onChange={(e) => setValue(e.target.value)}
  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
>
  <option value="">Select an option</option>
  <option value="option1">Option 1</option>
</select>
```

## Textarea Template

```jsx
<textarea
  value={value}
  onChange={(e) => setValue(e.target.value)}
  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
  rows={3}
/>
```

## Common Mistakes to Avoid

❌ **DON'T:**
```jsx
// Missing text-gray-900 and bg-white
className="w-full px-3 py-2 border border-gray-300 rounded-md"
```

❌ **DON'T:**
```jsx
// Only has bg-white, missing text color
className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white"
```

✅ **DO:**
```jsx
// Always include both text-gray-900 and bg-white
className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
```

## Color Palette

### Text Colors
- **Primary text:** `text-gray-900` (dark, high contrast)
- **Secondary text:** `text-gray-700` (medium dark)
- **Muted text:** `text-gray-500` (lighter, for hints)
- **Error text:** `text-red-700`
- **Success text:** `text-green-700`

### Background Colors
- **Input backgrounds:** `bg-white` (always white for inputs)
- **Page backgrounds:** `bg-gray-50` (light gray)
- **Card backgrounds:** `bg-white`

### Border Colors
- **Default borders:** `border-gray-300`
- **Focus borders:** `focus:ring-2 focus:ring-blue-500`
- **Error borders:** `border-red-300`

## Checklist Before Committing

Before committing any form-related changes, verify:

- [ ] All `<input>` elements have `text-gray-900 bg-white`
- [ ] All `<select>` elements have `text-gray-900 bg-white`
- [ ] All `<textarea>` elements have `text-gray-900 bg-white`
- [ ] No form elements rely on default browser styling
- [ ] All form elements are visible in both light and dark browser themes

## Testing

1. **Visual Test:** Open the page and verify all inputs have visible dark text
2. **Browser Test:** Test in Chrome, Firefox, and Safari
3. **Theme Test:** If browser has dark mode, verify inputs still show dark text on white background
4. **Focus Test:** Click into each input and verify text remains visible

## Quick Fix Command

If you find an input with white text, add these classes:
```
text-gray-900 bg-white
```

Example:
```jsx
// Before
className="w-full px-3 py-2 border border-gray-300 rounded-md"

// After
className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 bg-white"
```
















