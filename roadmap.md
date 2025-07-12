The Final Master Blueprint: Commercial-Grade WhatsApp Automation System for the Egyptian Market (July 2025 Edition)
1. The Product Vision: A Robust, Sellable, Turn-Key Solution
You are a lead full-stack architect. Your mission is to build a commercial-grade, multi-tenant-ready WhatsApp automation system. This is a sellable product, not a personal script. Its primary differentiator is its ability to handle the messy, inconsistent data typical of real-world e-commerce operations in the Egyptian market. The system must be entirely configurable and manageable through a professional, Arabic-language (RTL) web interface.
2. The Core Intelligence: Data-Processing Engine & Business Logic
This is the system's "brain" and the most critical component. It must be built with a two-stage process: Data Sanitization followed by Logic Application.
2.1. Stage One: The Data Sanitization & Phone Number Resolution Engine
Before any logic is applied, the system must process each row from the Google Sheet to find and clean the correct contact number. This is a mandatory, multi-step process:
Phone Number Prioritization: For each order row, the system must first check the الواتساب column.
If it contains a valid number, use it as the primary contact number.
If it is empty or invalid, fall back and use the number from the رقم التليفون column.
Number Cleaning Algorithm: Take the chosen number and apply the following cleaning steps sequentially:
Remove all non-digit characters: This includes spaces, +, -, (, ).
Standardize the Country Code: Enforce the Egyptian country code (20).
If the cleaned number starts with 01 (e.g., 011..., 012..., 010...), remove the leading 0 and prepend 20. (e.g., 01122334455 becomes 201122334455).
If the cleaned number already starts with 20, it is considered correctly formatted.
Validate Length: After formatting, the final number must be 12 digits long (20 + 10 digits). If not, it is invalid.
Final WhatsApp Check: Use whatsapp-web.js's isRegisteredUser function on the fully sanitized, 12-digit number. If it is not a valid WhatsApp user, the system must update the حالة الواتساب column in the sheet to "رقم واتساب غير صحيح" and take no further action for this order in the current cycle.
2.2. Stage Two: Business Logic Mapping (Based on the Google Sheet)
For every order with a valid WhatsApp number, the system will apply the following logic based on the text in the حالة الطلب column:
If حالة الطلب is قيد المراجعه (Under Review): This is treated as a New Order. Send the "Welcome" message.
If حالة الطلب is لا يرد (No Answer): Send the "We tried to call you" follow-up message.
Automatic Reminder: If an order's status remains قيد المراجعه or لا يرد for a user-defined period (default: 24 hours), send the "Gentle Reminder" message.
The Smart Rejected Offer (رفض الأستلام - Refused Delivery): This is the key revenue recovery feature.
When the status is changed to رفض الأستلام, schedule a delayed job.
This job will execute after a user-defined period (default: 48 hours) and send the "Special Discount Offer" message.
If حالة الطلب is تم التاكيد (Confirmed) or تم الشحن (Shipped): Send the "Order Shipment Confirmation" message.
If حالة الطلب is تم التوصيل (Delivered): This is a final state. No message is required, but the system should log it as a successfully completed order.
3. The User Control Center: The Dynamic UI (In Arabic)
The user must have absolute control through a professional Arabic (RTL) interface.
Main Dashboard (/dashboard): A live view of the user's Google Sheet, showing the real-time status of their orders.
Settings (/settings): The Central Hub for All Configuration.
WhatsApp Connection: Standard QR code and session management buttons (Initialize, Logout, Clear Session).
Google Integration (The key commercial feature):
Field 1 (Sheet URL): An input for the user to paste their Google Sheet link.
Field 2 (Google Service Account Credentials): A large <textarea> for the user to paste the entire content of their google-credentials.json file. This must have clear instructions in Arabic.
A single "Save & Validate Google Settings" button that saves the credentials and link, then immediately tests the connection.
Message Template Customization: A user-friendly form to edit the text of all automated messages. Available placeholders from the sheet ({أسم العميل}, {أجمالى المبلغ}, {رابط الطلب}, etc.) must be listed.
Advanced Timings: User-configurable inputs for all operational delays (check interval, reminder delay, etc.).
4. The Architectural Blueprint: The 2025 Commercial-Grade Stack
Framework: Next.js 14+ with TypeScript.
WhatsApp Engine: whatsapp-web.js.
Job Queues & Scheduling: BullMQ with Redis. Essential for reliability and executing the delayed 48-hour offer.
Real-time UI: Socket.IO.
UI Framework: React, Tailwind CSS, Shadcn/ui (or similar) for a professional Arabic UI.
Configuration Storage: All user-provided settings will be stored in server-side config/*.json files.
5. Final Execution Plan for Cursor
Build the Configuration Backbone: Prioritize creating the API endpoints for saving and retrieving all user-configurable settings (Sheet URL, Google JSON content, templates, timings).
Implement the Data Sanitization Engine: Build the robust, multi-step phone number resolution and cleaning module as described in section 2.1. This is a critical first step for the core logic.
Develop Core Services: Build the backend services (WhatsApp, Google Sheets, BullMQ) to be fully dependent on the dynamic configuration files.
Implement the Business Logic Engine: Create the main "Processing Loop" that orchestrates the data sanitization and logic application stages.
Construct the UI: Build the complete Arabic UI, with a strong focus on the user-friendliness and clarity of the Settings page.
Finalize and Document: Generate a comprehensive README.md and a separate USER_GUIDE.md (in Arabic) explaining how to obtain and input all the required credentials.
Final Command: Cursor, execute this master blueprint to build a complete, commercial-grade, and resilient WhatsApp automation product. Its defining features are its ability to handle real-world messy data and its empowerment of the non-technical end-user through a fully dynamic configuration interface.