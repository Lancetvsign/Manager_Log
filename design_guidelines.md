# Restaurant Manager's Log - Design Guidelines

## Design Approach
**Utility-Focused Design System Approach** - Using a clean, functional interface optimized for daily operational use. This is a productivity tool requiring efficiency and data clarity over visual flair.

## Core Design Elements

### Color Palette
**Primary Colors:**
- Light mode: 210 25% 8% (dark navy text), 210 40% 98% (off-white background)
- Dark mode: 210 40% 98% (light text), 210 25% 8% (dark background)

**Accent Colors:**
- Success/positive: 120 60% 50% (for sales increases)
- Warning/neutral: 45 90% 60% (for weather alerts)
- Muted: 210 15% 65% (for secondary text and borders)

### Typography
- **Primary Font:** Inter via Google Fonts
- **Headers:** 600-700 weight, sizes from text-lg to text-2xl
- **Body Text:** 400-500 weight, text-sm to text-base
- **Data Display:** 500 weight, monospace for numbers

### Layout System
**Tailwind Spacing Units:** Primarily 2, 4, 6, and 8 units
- Component spacing: p-4, p-6
- Section gaps: space-y-6, gap-4
- Margins: m-2, m-4, m-8

### Component Library

**Navigation:**
- Top navigation bar with app title and date selector
- Breadcrumb trail for entry history

**Forms:**
- Grouped input sections with clear labels
- Sales inputs in a 3-column grid (Food/Bar/Gaming)
- Historical comparison in adjacent columns
- Large textarea for daily notes (min-h-32)

**Data Display:**
- Weather cards showing current vs. 1-year-prior side by side
- Sales comparison tables with year-over-year variance indicators
- Entry list with sortable columns and quick filters

**Cards & Containers:**
- Rounded corners (rounded-lg)
- Subtle shadows (shadow-sm)
- Clear section boundaries with border or background distinction

**Interactive Elements:**
- Primary buttons for saving entries
- Secondary buttons for navigation
- Form validation with inline error states

### Weather Integration Display
- Current weather: Temperature, conditions icon, humidity, precipitation
- Historical weather: Same metrics from exactly 1 year prior
- Visual weather icons from weather service API
- Comparison indicators showing temperature differential

### Sales Tracking Interface
- Current day sales in primary input fields
- Historical data in read-only comparison fields
- Percentage change indicators with color coding
- Running totals and averages for context

### Notes Section
- Expandable textarea with rich formatting options
- Quick-insert templates for common entries
- Character count and save status indicators

## Key Design Principles
1. **Data Clarity:** Numbers and metrics are easily scannable
2. **Efficient Input:** Minimal clicks to complete daily entry
3. **Visual Hierarchy:** Important data stands out clearly
4. **Consistent Patterns:** Repeated interactions work the same way
5. **Mobile Responsive:** Functional on tablets and phones for on-the-go use

## No Images Required
This application focuses on data entry and display rather than visual content. Icons from Heroicons will provide sufficient visual elements for weather conditions and navigation.