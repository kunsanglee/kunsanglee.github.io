---
title: "Functional Interface API"
categories:
  - Java
tags:
  - Functional Interface
  - 함수형 메서드
toc: true
toc_sticky: true
toc_label: ""
toc_icon: ""
---

Functional Interface는 함수를 일급객체처럼 다룰 수 있게 해주는 단 하나의 추상 메서드를 가지는 인터페이스이다. `final` 상수나 `default`, `static`, `private` 메서드는 추상 메서드가 아니기 때문에, 이들 여러개가 인터페이스에 들어있어도 단 한 개의 추상 메서드를 가지면 함수형 인터페이스로 취급 된다. 자바 8부터 인터페이스에 `default` 메서드와 `static` 메서드를 추가할 수 있게 되면서 가능해졌다.


```java
@FunctionalInterface
public interface Operator {
    int operate(int x, int y); // 추상 메서드
}

@FunctionalInterface
public interface MyInterface {
	// 인터페이스에 상수를 선언하는 것은 캡슐화를 위반하며, 책임을 벗어나는 경우가 많기 때문에 비권장
	int MY_CONSTANT = 100;  // 상수 선언(public static final 키워드 생략)
	
    void abstractMethod();  // 추상 메서드(public abstract 키워드 생략)

    default void defaultMethod() {  // default 메서드
        System.out.println("Default method");
    }

    static void staticMethod() {  // static 메서드
        System.out.println("Static method");
    }
}

// 추상 메서드가 2개라서 함수형 인터페이스가 될 수 없다
public interface MyInterface { 
    void abstractMethod1();
    void abstractMethod2();
}
```

`@FunctionalInterFace` 어노테이션을 붙이면 이 인터페이스는 Functional Interface인 것을 명시함과 동시에 해당 인터페이스에 새로운 메서드를 추가하거나 다른 인터페이스를 상속받을시 컴파일 에러가 발생한다.

### Functional Interface 표준 API
```
1. Runnable : void run() 매개변수와 반환이 없음. 쓰레드의 매개변수로 사용.
2. Consumer<T> : void accept(T t) 반환이 없이 매개변수만 받아서 처리.
3. Supplier<T> : T get() 매개변수가 없고 T 타입을 반환.
4. Function<T, R> : R apply(T t) T 타입의 매개변수를 받아서 R 타입으로 반환.
5. Predicate<T> : boolean test(T t) 매개값이 조건에 맞는지 반환.
6. Operator : R applyAs(T t) 매개값을 연산해서 결과 반환.
```

이번 미션 수행중 사용자의 입력을 받을 때 에러가 발생하면 재입력을 받아야한다는 요구사항을 만족시키기 위해  함수형 인터페이스 표준 API Supplier와 Consumer 적용해봤다.

```java
private LottosDto purchaseUserLotto() {  
    outputView.printPurchaseAmount();  
    String inputPurchaseAmount = inputView.getUserInput();  
    return lottoGameService.purchaseLottos(inputParser.parsePurchaseAmount(inputPurchaseAmount));  
}

private void getUserInputForLottoGame() {  
    repeat(this::purchaseUserLotto, outputView::printPurchasedLottos);
}

private <T> void repeat(Supplier<T> supplier, Consumer<T> consumer) {  
    while (true) {  
        try {  
            T result = supplier.get();  
            consumer.accept(result); // consumer.accept(supplier.get());
            return;  
        } catch (IllegalArgumentException e) {  
            outputView.printExceptionMessage(e.getMessage());  
        }  
    }  
}
```

repeat 메서드는 T 타입의 Supplier와 Consumer를 받아서 처리하고 반환이 없는 함수다. getUserInputForLottoGame() 메서드에서 repeat()의 Supplier 타입 매개변수로 purchaseUserLotto() 메서드를 넣고, Consumer 타입 매개변수로 outputView.printPurchasedLottos() 메서드를 넣는다.

purchaseUserLotto() 메서드는 LottosDto를 반환하는 메서드이기 때문에 Supplier 타입 매개변수 supplier가 되어 supplier.get() 메서드를 호출해 T 타입 반환값 result를 만들어낸다.

그리고 outputView.printPurchasedLottos() 메서드는 콘솔에 출력만 할 뿐 반환값이 없는 메서드이기 때문에 Consumer 타입 매개변수 consumer가 되어 consumer.accept() 메서드로 result를 받아서 수행한다.

정리하자면 repeat() 메서드의 try 문 안에서 supplier.get()의 반환으로 result는 LottosDto 타입이 되었고, 결국 consumer.accept() 메서드의 인자로 LottosDto가 들어가 outputView.printPurchasedLottos(result); 코드를 수행하게 된다.

try문 안에서 IllegalArgumentException 에러가 발생할 경우 outputView.printExceptionMessage() 메서드를 호출하고 while문을 빠져나가지 못했기 때문에 try 문을 반복하여 정상적인 사용자의 입력을 받을 때 까지 반복한다.
