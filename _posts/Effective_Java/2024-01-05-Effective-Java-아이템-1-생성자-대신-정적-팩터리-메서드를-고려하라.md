---
title: "Effective Java - 아이템 1: 생성자 대신 정적 팩터리 메서드를 고려하라"
categories:
  - Effective Java
tags:
  - Effective Java
toc: true
toc_sticky: true
toc_label: ""
toc_icon: ""
---

## 정적 팩터리 메서드
`new`키워드로 생성하지 않고 객체 생성해서 반환하는 메서드다.

```java
// 필드가 private final이고 필드의 값을 수정하는 방법이 없기 때문에 불변 클래스다.
public class MyNumber {
    public static final int ZERO = new MyNumber(0); // 여러 곳에서 사용하는 값을 캐싱.
    private final int number;

    // 생성자의 접근자를 private로 하여 외부에서 생성자를 호출하지 못하도록 한다.
    private MyNumber(int number) {
        this.number = number;
    }

    // 외부에서 객체를 생성하여 반환받을 수 있는 public API 제공.
    public static MyNumber from(int number) {
        return new MyNumber(number);
    }
    
    // 클래스에 상수로 선언한 ZERO가 필요하면 새로 생성하지 않고 캐싱해둔 값을 제공한다.
    public static MyNumber getZero() {
        return ZERO;
    }
}
```

### 정적 팩터리 메서드의 장점

1. 이름을 가질 수 있다.
> 생성자에 넘기는 매개변수와 생성자 자체만으로는 반환될 객체의 특성을 제대로 설명하지 못한다.
> 반면 정적 팩터리는 이름만 잘 지으면 반환될 객체의 특성을 쉽게 묘사할 수 있다.
> 그래서 한 클래스에 시그니처가 같은 생성자가 여러개 필요할 것 같으면(생성자 오버라이딩 할 메서드가 많다면) 
> 정적 팩터리 메서드로 바꾸고 메서드 네이밍을 잘 지어주는 것이 좋다.
2. 호출될 때마다 인스턴스를 새로 생성하지 않아도 된다.
> 불변 클래스(immutable class)는 인스턴스를 미리 만들어 놓거나 
> 새로 생성한 인스턴스를 캐싱하여 재활용하는 식으로 불필요한 객체 생성을 피할 수 있다.
> 정적 팩터리 메서드는 필요에 따라 미리 생성된 인스턴스를 반환하거나, 
> 생성된 인스턴스를 캐싱하여 재사용할 수 있다. 이는 불변 클래스에서 특히 유용하며, 이를 통해 객체 생성 비용을 줄일 수 있다.
> 플라이 웨이트 패턴(Flyweight pattern)과 유사한 기법이다.
> 반복되는 요청에 같은 객체를 반환하는 식으로 정적 팩터리 방식의 클래스는 인스턴스를 살아있게 할지를 철저히 통제할 수 있다.
> 이런 클래스를 인스턴스 통제 클래스라 한다.
> 인스턴스를 통제할 수 있다면 클래스를 싱글턴으로 만들 수도, 인스턴스화 불가로 만들 수 있고,
> 불변 클래스에서 동치인 인스턴스가 단 하나뿐임을 보장할 수 있다.
> 또 열거 타입 인스턴스가 하나만 만들어짐을 보장한다.
3. 반환 타입의 하위 객체를 반환할 수 있는 능력이 있다.
> 생성자는 해당 타입만 반환하지만, 팩터리 메서드는 다형성을 이용해 반환할 객체의 클래스를 자유롭게 선택할 수 있게 하는 유연성을 준다.
> 이 유연성을 응용하면 구현 클래스를 공개하지 않고도 그 객체를 반환할 수 있다.
> 클라이언트는 알 필요 없는 정보를 캡슐화할 수 있다.

 ```java
public interface DiscountPolicy {
    Amount discount(Order order);
}

public interface DiscountCondition {
    boolean isDiscountable(Order order);
}

public class PercentDiscountPolicy implements DiscountPolicy {
    private static final double DISCOUNT_PERCENT = 0.1;

    @Override
    public Amount discount(Order order) {
        return new Amount(order.getAmount().multiply(DISCOUNT_PERCENT));
    }
}

public class PercentDiscountCondition implements DiscountCondition {
    private final DiscountCondition discountCondition;

    public PercentDiscountCondition(DiscountCondition discountCondition) {
        this.discountCondition = discountCondition;
    }
    
    @Override
    public boolean isDiscountable(Order order) {
        return discountCondition.isDiscountable(order);
    }
}

public class DiscountPolicies {
    private static final List<DiscountPolicy> discountPolicies = new ArrayList<>();

    static {
        discountPolicies.add(new PercentDiscountPolicy(new PercentDiscountCondition()));
    }

    // 여러 할인 정책중에 할인 가능한 하나의 할인 정책을 반환하는 정적 팩터리 메서드.
    // discountPolicies에 DiscountPolicy 인터페이스를 구현한 각기 다른 구현체들이 들어있다.
    // 정적 팩터리 메서드를 사용하면 구체 클래스인 PercentDiscountPolicy 타입으로 반환하지 않고,
    // 다형성을 이용해 상위 타입으로 반환할 수 있다.
    public static DiscountPolicy getDiscountableDiscountPolicy(Order order) {
        return discountPolicies.stream()
                .filter(discountPolicy -> discountPolicy.isDiscountable(order))
                .findAny()
                .orElse(new NoneDiscountPolicy());
    }
}
```

4. 입력 매개변수에 따라 매번 다른 클래스의 객체를 반환할 수 있다.
> 반환 타입이 하위 타입이기만 하면 어떤 클래스의 객체를 반환하든 상관없다.
> 클라이언트는 팩터리가 건네주는 객체가 어느 클래스의 인스턴스인지 알 수도 없고 알 필요도 없다.
> 위의 예시 코드의 getDiscountableDiscountPolicy 메서드의 반환 타입이 그 예다.
5. 정적 팩터리 메서드를 작성하는 시점에는 반환할 객체의 클래스가 존재하지 않아도 된다.
> 위의 예시 코드에서 DiscountPolicy 인터페이스를 구현하는 새로운 클래스가 추가된다고 해도 기존 코드를 변경할 필요가 없다.

### 정적 팩터리 메서드의 단점

1. 상속을 하려면 public이나 protected 생성자가 필요하니 정적 팩터리 메서드만 제공하면 하위 클래스를 만들 수 없다.
> 상속을 하는 하위 클래스의 생성자에서 상위 클래스의 생성자 super()를 호출해야 하지만,
> 상위 클래스에서 정적 팩토리 메서드를 제공하며 생성자의 접근자가 private라면 상속할 수 없다. 
2. 정적 팩터리 메서드는 프로그래머가 찾기 어렵다.
> 생성자처럼 API 설명에 명확히 드러나지 않아 사용자가 직접 생성자를 대신할 팩터리 메서드를 알아내야 한다.
> 이런 이유로 널리 알려진 규약을 따라 메서드 이름을 짓는다.

### 정적 팩터리 메서드 명명 방식
- from: 매개 변수를 하나 받아서 해당 타입의 인스턴스를 반환하는 형변환 메서드
  - Date d = Date.from(instant);

- of: 여러 매개변수를 받아 적합한 타입의 인스턴스를 반환하는 집계 메서드
  - Set<Rank> faceCards = EnumSet.of(JACK, QUEEN, KING);

- valueOf: from과 of의 더 자세한 버전
  - BigInteger prime = BigInteger.valueOf(Integer.MAX_VALUE);

- instance 혹은 getInstance: 매개변수를 받는다면 매개변수로 명시한 인스턴스를 반환하지만, 같은 신스턴스임을 보장하지는 않는다.
  - StackWalker luke = StackWalker.getInstance(options);

- create 혹은 newInstance: instance 혹은 getInstance와 같지만, 매번 새로운 인스턴스를 생성해 반환함을 보장한다.
  - Object newArray = Array.newInstance(classObject, arrayLen);

- getType: getInstance와 같으나, 생성할 클래스가 아닌 다른 클래스에 팩터리 메서드를 정의할 때 쓴다.
  - FileStore fs = Files.getFileStore(path);

- newType: newInstance와 같으나, 생성할 클래스가 아닌 다른 클래스에 패겉리 메서드를 정의할 때 쓴다.
  - BufferedReader br = Files.newBufferedReader(path);

- type: getType과 newType의 간결한 버전
  - List<Complaint> litany = Collections.list(legacyLitany);

### 핵심 정리
> 정적 팩터리 메서드와 public 생성자는 각자의 쓰임새가 있으니 상대적인 장단점을 이해하고 사용하는 것이 좋다.<br>
> 정적 팩터리를 사용하는 게 유리한 경우가 더 많으므로 무작정 public 생성자를 제공하던 습관이 있다면 고치자.
