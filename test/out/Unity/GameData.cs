using System.Collections.Generic;
using System.Linq;
using Newtonsoft.Json;

public static class GameData
{
	public static Dictionary<StatSetId,StatSet> statSets { get; private set; }
	public static Dictionary<UnitId,Unit> unitTable { get; private set; }

	public static void Load(Dictionary<string,string> dataSource)
	{
		statSets = JsonConvert.DeserializeObject<Dictionary<StatSetId,StatSet.Raw>>(dataSource["StatSets"]).ToDictionary(keyValuePair => keyValuePair.Key, keyValuePair => new StatSet(keyValuePair.Value));
		unitTable = JsonConvert.DeserializeObject<Dictionary<UnitId,Unit.Raw>>(dataSource["UnitTable"]).ToDictionary(keyValuePair => keyValuePair.Key, keyValuePair => new Unit(keyValuePair.Value));
	}

	public static void Load()
	{

		Load(JsonConvert.DeserializeObject<Dictionary<string,string>>((UnityEngine.Resources.Load("GameData") as UnityEngine.TextAsset).text));
	}

	public enum StatSetId
	{
		WeakSet,
		StandardSet,
		StrongSet
	};
	public enum UnitId
	{
		Peon,
		Warrior,
		Chief
	};

	[JsonObject(MemberSerialization.OptIn)]
public struct StatSet
	{
		/// <summary>Unique identifer for a a set of stats.
		public StatSetId statSetId { get{ return rawData.statSetId; } }

		/// <summary>Determines the amount of a hits a unit can take before perishing.
		public int health { get{ return rawData.health; } }

		/// <summary>Determines how hard a unit hits, will be reduced by the attacked units armor.
		public int attack { get{ return rawData.attack; } }

		/// <summary>Determines how much damage is mitigated in an attack on this unit.
		public int armor { get{ return rawData.armor; } }


		public StatSet(Raw rawData)
{
			this.rawData = rawData;
		}

		[JsonProperty]
		private Raw rawData;
		public struct Raw
		{
			public StatSetId statSetId;
			public int health;
			public int attack;
			public int armor;
		}
	}
	[JsonObject(MemberSerialization.OptIn)]
public struct Unit
	{
		public UnitId unitId { get{ return rawData.unitId; } }

		public StatSet stats { get{ return GameData.statSets[rawData.stats]; } }


		public Unit(Raw rawData)
{
			this.rawData = rawData;
		}

		[JsonProperty]
		private Raw rawData;
		public struct Raw
		{
			public UnitId unitId;
			public StatSetId stats;
		}
	}
}