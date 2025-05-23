module.exports = {
	data: {
        name: "omikuji",
        description: "おみくじを引くことができます。",
    },
	async execute(interaction) {
        let arr = ["https://i.ibb.co/CwD67y5/5.png", "https://i.ibb.co/TqnpK7Q/4.png", "https://i.ibb.co/CP0P5n5/3.png", "https://i.ibb.co/GRhTSHh/image.png", "https://i.ibb.co/5rXXv7b/2.png", "https://i.ibb.co/W6y4YrN/1.png", "https://i.ibb.co/bBdQH47/image.png"];
        let weight = [15, 25, 20, 20, 15, 10, 5];
        let totalWeight = 0;
        for (var i = 0; i < weight.length; i++){
          totalWeight += weight[i];
        }
        let random = Math.floor( Math.random() * totalWeight);
        for (var i = 0; i < weight.length; i++){
          if (random < weight[i]){
            await interaction.reply(arr[i]);
            return;
          }else{
            random -= weight[i];
          }
        }
        console.log("lottery error");
	}
}
