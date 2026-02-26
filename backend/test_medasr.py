import sys
from transformers import AutoProcessor, AutoModelForCTC
processor = AutoProcessor.from_pretrained("google/medasr")
print("Processor:", type(processor))
print("Tokenizer:", type(processor.tokenizer))
try:
    print("Pad token:", processor.tokenizer.pad_token_id)
except Exception as e:
    print(e)
