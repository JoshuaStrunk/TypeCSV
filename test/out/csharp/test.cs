[JsonObject(MemberSerialization.OptIn)]
	private struct StatSet
	{
		public StatSetId { get{ return rawData.statSetId; } }
		public int health { get{ return rawData.health; } }
		public int attack { get{ return rawData.attack; } }
		public int armor { get{ return rawData.armor; } }
		[JsonProperty]
		private Raw rawData;

        public StatSet(Raw rawData)
        {
            this.rawData = rawData;
        }

		public struct Raw
		{
			public StatSetId statSetId;
			public int health;
			public int attack;
			public int armor;
		}


        Deserialize<Dictionary<StatSetId, StatSet.Raw>>().ToDictionary(keyValuePair => keyValuePair.Key, new StatSet(keyValuePair.Value))
	}