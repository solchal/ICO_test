import "./jetton";
message Mint {
    amount: Int;
    receiver: Address;
}
message SetupICO {
    price: Int;
    start_time: Int;
    end_time: Int;
    hard_cap: Int;
}
message UpdateICO {
    new_price: Int;
    new_end_time: Int;
}
message FinalizeICO {
    emergency: Bool;
}

contract ICOwithJetton with Jetton {

    total_supply: Int as coins;
    owner: Address;
    content: Cell;
    mintable: Bool;
    max_supply: Int as coins;

    ico_active: Bool = false;
    ico_price: Int = 0;
    ico_start_time: Int = 0;
    ico_end_time: Int = 0;
    ico_hard_cap: Int as coins = 0;
    ico_tokens_sold: Int as coins = 0;

    init(owner: Address, content: Cell, max_supply: Int){
        self.total_supply = 0;
        self.owner = owner;
        self.mintable = true;
        self.content = content;
        self.max_supply = max_supply;
    }

    receive(msg: Mint){
        let ctx: Context = context();
        require(ctx.sender == self.owner, "Not owner");
        require(self.mintable, "Not mintable");
        require((self.total_supply + msg.amount) <= self.max_supply, "Max supply exceeded");
        self.mint(msg.receiver, msg.amount, self.owner);
    }

    receive("Mint: 100"){
        let ctx: Context = context();
        require(self.mintable, "Not mintable");
        require((self.total_supply + 100) <= self.max_supply, "Max supply exceeded");
        self.mint(ctx.sender, 100, self.owner);
    }

    receive("Owner: MintClose"){
        let ctx: Context = context();
        require(ctx.sender == self.owner, "Not owner");
        self.mintable = false;
    }

    receive(msg: SetupICO){

        let ctx: Context = context();

        require(ctx.sender == self.owner, "Not owner");
        require(msg.start_time >= 0, "Start time must be in the future");
        require(msg.end_time > msg.start_time, "End time must be after start time");
        require(msg.price > 0, "Price must be greater than 0");
        require(msg.hard_cap > 0 && msg.hard_cap <= self.max_supply, "Invalid hard cap");

        self.ico_price = msg.price;
        self.ico_start_time = now() + msg.start_time;
        self.ico_end_time = now() + msg.end_time;
        self.ico_hard_cap = msg.hard_cap;
        self.ico_active = true;
    }

    receive(){
        require(self.ico_active, "ICO is not active");
        require(now() >= self.ico_start_time, "ICO has not started yet");
        require(now() <= self.ico_end_time, "ICO has already ended");
        require(self.ico_tokens_sold < self.ico_hard_cap, "Hard cap reached");
        require(self.mintable, "Minting is closed");

        let ctx: Context = context();
        let amount: Int = ctx.value;
        require(amount >= ton("0.1"), "Minimum contribution is 0.1 TON");
        
        let gas_reserve: Int = ton("0.05");
        require(amount > gas_reserve, "Insufficient funds to cover gas");

        let tokens_to_buy: Int = ((amount - gas_reserve) * ton("1")) / self.ico_price;
        
        require((self.total_supply + tokens_to_buy) <= self.max_supply, "Exceed max supply");
        
        if ((self.ico_tokens_sold + tokens_to_buy) > self.ico_hard_cap) {
            tokens_to_buy = self.ico_hard_cap - self.ico_tokens_sold;
            
            let refund: Int = (amount - gas_reserve) - ((tokens_to_buy * self.ico_price) / ton("1"));
            if (refund > ton("0.01")) {
                send(SendParameters{to: ctx.sender, value: refund, bounce: false, mode: SendIgnoreErrors});
            }
        }

        self.ico_tokens_sold = self.ico_tokens_sold + tokens_to_buy;
        
        self.mint(ctx.sender, tokens_to_buy, self.owner);
        
        send(SendParameters{to: self.owner, value: amount - gas_reserve, bounce: false, mode: SendIgnoreErrors});
    }

    receive(msg: UpdateICO){
        let ctx: Context = context();
        require(ctx.sender == self.owner, "Not owner");
        require(self.ico_active, "ICO is not active");
        // Update price if specified
        if (msg.new_price > 0) {
            self.ico_price = msg.new_price;
        }

        // Update end time if valid
        if (msg.new_end_time > 0 && msg.new_end_time + now() > self.ico_start_time) {
            self.ico_end_time = msg.new_end_time + now();
        }
    }

    receive(msg: FinalizeICO){
        let ctx: Context = context();
        require(ctx.sender == self.owner, "Not owner");
        require(self.ico_active, "ICO is not active");
        if (msg.emergency) {
            // Emergency stop
            self.ico_active = false;
            self.ico_end_time = now();
        } else {
            // Regular finalization - require minimum duration
            require(now() >= self.ico_start_time, "ICO hasn't started");
            self.ico_active = false;
            self.ico_end_time = now();
        }
    }

    get fun ico_info(): ICOInfo {
        return
            ICOInfo{
                active: self.ico_active,
                price: self.ico_price,
                hard_cap: self.ico_hard_cap,
                tokens_sold: self.ico_tokens_sold,
                is_ongoing: self.ico_active &&
                            now() >= self.ico_start_time &&
                            now() <= self.ico_end_time &&
                            self.ico_tokens_sold < self.ico_hard_cap
            };
    }
}

struct ICOInfo {
    active: Bool;
    price: Int;
    hard_cap: Int;
    tokens_sold: Int;
    is_ongoing: Bool;
}