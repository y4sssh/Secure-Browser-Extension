from pymongo import MongoClient

from .config import settings


client = MongoClient(settings.mongodb_uri, serverSelectionTimeoutMS=2000)
db = client[settings.db_name]
