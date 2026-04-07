import os
import google.genai as genai
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# Configure the generative AI model
api_key = os.getenv("GOOGLE_API_KEY")
if not api_key or api_key == "YOUR_API_KEY_HERE":
    print("ERROR: Please set your GOOGLE_API_KEY in the backend/.env file first.")
    exit()

try:
    genai.configure(api_key=api_key)

    print("\n[+] Models available for your API key that support 'generateContent':")
    print("--------------------------------------------------------------------")
    
    found_model = False
    for m in genai.list_models():
      if 'generateContent' in m.supported_generation_methods:
        print(m.name)
        found_model = True

    if not found_model:
        print("\nNo models supporting 'generateContent' found for your API key.")
        print("Please ensure your API key is correct and has the 'Generative Language API' enabled in your Google Cloud project.")
    
    print("--------------------------------------------------------------------")
    print("\n=> Please copy the full name of one of the models above and paste it here.")

except Exception as e:
    print(f"\n[!] An error occurred: {e}")
    print("Please double-check that your API key in the .env file is correct.")
